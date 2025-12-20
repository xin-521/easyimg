/**
 * 通知服务 - 支持 Webhook、Telegram 和 Email 通知
 * 后续可扩展支持其他通知方式（钉钉等）
 */

import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import db from './db.js'
import TelegramBot from 'node-telegram-bot-api'
import nodemailer from 'nodemailer'
import { getImagePath } from './upload.js'
import { getFileFromS3 } from './s3.js'

// 通知类型枚举
export const NOTIFICATION_TYPES = {
  LOGIN: 'login',           // 登录通知
  UPLOAD: 'upload',         // 图片上传通知
  NSFW_DETECTED: 'nsfw',    // 鉴黄检测结果通知
  // 后续可扩展
  // DELETE: 'delete',      // 图片删除通知
  // API_KEY: 'apikey',     // API Key 操作通知
}

// 通知方式枚举
export const NOTIFICATION_METHODS = {
  WEBHOOK: 'webhook',
  TELEGRAM: 'telegram',
  EMAIL: 'email',
  SERVERCHAN: 'serverchan',
  // 后续可扩展
  // DINGTALK: 'dingtalk',
}

// 默认通知配置
export function getDefaultNotificationConfig() {
  return {
    enabled: false,
    method: NOTIFICATION_METHODS.TELEGRAM,
    // 各类型通知开关（默认全部开启）
    types: {
      [NOTIFICATION_TYPES.LOGIN]: true,
      [NOTIFICATION_TYPES.UPLOAD]: true,
      [NOTIFICATION_TYPES.NSFW_DETECTED]: true,
    },
    // Webhook 配置
    webhook: {
      url: '',
      method: 'POST',
      contentType: 'application/json',
      headers: {},  // 自定义请求头，如 { "Authorization": "Bearer xxx" }
      // 请求体模板，支持变量替换
      // 可用变量: {{type}}, {{title}}, {{message}}, {{timestamp}}, {{data}}
      bodyTemplate: JSON.stringify({
        type: '{{type}}',
        title: '{{title}}',
        message: '{{message}}',
        timestamp: '{{timestamp}}',
        data: '{{data}}'
      }, null, 2)
    },
    // Telegram 配置
    telegram: {
      token: '',    // Bot Token
      chatId: ''    // Chat ID
    },
    // Email 配置
    email: {
      service: '',  // 邮件服务商，如 'gmail', 'qq', '163' 等
      user: '',     // 发件人邮箱
      pass: '',     // 邮箱授权码/密码
      to: ''        // 收件人邮箱（可选，默认发送给自己）
    },
    // Server酱 配置
    serverchan: {
      sendKey: ''   // Server酱 SendKey
    }
  }
}

/**
 * 获取通知配置
 */
export async function getNotificationConfig() {
  try {
    const configDoc = await db.settings.findOne({ key: 'notificationConfig' })
    if (configDoc?.value) {
      // 合并默认配置，确保新增字段有默认值
      const defaultConfig = getDefaultNotificationConfig()
      return {
        ...defaultConfig,
        ...configDoc.value,
        types: {
          ...defaultConfig.types,
          ...configDoc.value.types
        },
        webhook: {
          ...defaultConfig.webhook,
          ...configDoc.value.webhook
        },
        telegram: {
          ...defaultConfig.telegram,
          ...configDoc.value.telegram
        },
        email: {
          ...defaultConfig.email,
          ...configDoc.value.email
        },
        serverchan: {
          ...defaultConfig.serverchan,
          ...configDoc.value.serverchan
        }
      }
    }
    return getDefaultNotificationConfig()
  } catch (error) {
    console.error('[Notification] 获取配置失败:', error)
    return getDefaultNotificationConfig()
  }
}

/**
 * 保存通知配置
 */
export async function saveNotificationConfig(config) {
  try {
    await db.settings.update(
      { key: 'notificationConfig' },
      {
        $set: {
          value: config,
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    )
    return { success: true }
  } catch (error) {
    console.error('[Notification] 保存配置失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 替换模板变量
 */
function replaceTemplateVariables(template, variables) {
  let result = template
  for (const [key, value] of Object.entries(variables)) {
    const placeholder = `{{${key}}}`
    // 如果值是对象，转换为 JSON 字符串
    const replacement = typeof value === 'object' ? JSON.stringify(value) : String(value)
    result = result.split(placeholder).join(replacement)
  }
  return result
}

/**
 * 发送 Webhook 通知
 */
async function sendWebhookNotification(config, payload) {
  const { webhook } = config

  if (!webhook.url) {
    console.warn('[Notification] Webhook URL 未配置')
    return { success: false, error: 'Webhook URL 未配置' }
  }

  try {
    // 准备模板变量
    const variables = {
      type: payload.type,
      title: payload.title,
      message: payload.message,
      timestamp: payload.timestamp || new Date().toISOString(),
      data: payload.data || {}
    }

    // 替换请求体模板中的变量
    let body = webhook.bodyTemplate
    body = replaceTemplateVariables(body, variables)

    // 构建请求头
    const headers = {
      'Content-Type': webhook.contentType || 'application/json',
      ...webhook.headers
    }

    // 发送请求
    const response = await fetch(webhook.url, {
      method: webhook.method || 'POST',
      headers,
      body
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('[Notification] Webhook 请求失败:', response.status, errorText)
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`
      }
    }

    console.log('[Notification] Webhook 通知发送成功:', payload.type)
    return { success: true }
  } catch (error) {
    console.error('[Notification] Webhook 发送失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 检查URL是否为有效的完整URL（包含协议和主机）
 */
function isValidImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * 从存储系统读取图片（S3或本地）
 * @param {string} filename - 图片文件名
 * @returns {Promise<Buffer|null>} 图片Buffer，失败返回null
 */
async function readLocalImage(filename) {
  try {
    // 尝试从S3获取图片
    const buffer = await getFileFromS3(filename)
    return buffer
  } catch (error) {
    console.warn('[Notification] 从S3读取图片失败:', error.message)
    return null
  }
}

/**
 * 根据content-type获取文件扩展名
 */
function getExtensionFromContentType(contentType) {
  const map = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'image/svg+xml': 'svg'
  }
  return map[contentType] || 'jpg'
}

/**
 * 构建 Telegram 消息文本（用于 caption 或普通消息）
 */
function buildTelegramMessage(payload, includeImageUrl = false) {
  let message = `*${escapeMarkdown(payload.title)}*\n${escapeMarkdown(payload.message)}`

  // 如果有额外数据，添加到消息中
  if (payload.data && Object.keys(payload.data).length > 0) {
    message += '\n\n*详细信息:*'
    for (const [key, value] of Object.entries(payload.data)) {
      // 跳过图片URL（除非明确要求包含）
      if (!includeImageUrl && (key === 'url' || key === 'imageUrl')) continue
      const displayValue = typeof value === 'object' ? JSON.stringify(value) : value
      message += `\n• ${key}: \`${escapeMarkdown(String(displayValue))}\``
    }
  }

  return message
}

/**
 * 发送 Telegram 通知
 */
async function sendTelegramNotification(config, payload) {
  const { telegram } = config

  if (!telegram.token || !telegram.chatId) {
    console.warn('[Notification] Telegram Token 或 Chat ID 未配置')
    return { success: false, error: 'Telegram Token 或 Chat ID 未配置' }
  }

  try {
    console.log('[Notification] Telegram 通知预发送:', payload.title)

    const bot = new TelegramBot(telegram.token)
    const chatId = Number(telegram.chatId)

    // 检查是否有有效的图片URL需要发送
    const imageUrl = payload.data?.url || payload.data?.imageUrl
    const hasValidImageUrl = isValidImageUrl(imageUrl)

    // 优先尝试从本地读取图片文件
    const localFilename = payload.data?.filename
    let imageBuffer = null

    if (localFilename) {
      console.log('[Notification] 尝试读取本地图片:', localFilename)
      imageBuffer = await readLocalImage(localFilename)
    }

    if (imageBuffer) {
      // 成功读取本地图片，使用Buffer发送
      const caption = buildTelegramMessage(payload, false)
      const format = payload.data?.format || getExtensionFromContentType('image/jpeg')
      const contentType = `image/${format === 'jpg' ? 'jpeg' : format}`

      try {
        // 使用 sendPhoto API 发送图片（使用Buffer）
        await bot.sendPhoto(chatId, imageBuffer, {
          caption: caption,
          parse_mode: 'Markdown'
        }, {
          filename: localFilename,
          contentType: contentType
        })
        console.log('[Notification] Telegram 图片通知发送成功:', payload.title)
      } catch (photoError) {
        // 如果 sendPhoto 失败，回退到普通消息
        console.warn('[Notification] Telegram sendPhoto 失败，回退到普通消息:', photoError.message)

        let fallbackMessage = buildTelegramMessage(payload, true)
        if (hasValidImageUrl) {
          fallbackMessage += `\n\n🔗 [查看图片](${imageUrl})`
        }

        await bot.sendMessage(chatId, fallbackMessage, {
          parse_mode: 'Markdown',
          disable_web_page_preview: false
        })
        console.log('[Notification] Telegram 回退消息发送成功:', payload.title)
      }
    } else if (hasValidImageUrl) {
      // 本地读取失败但有URL，发送带链接的文本消息
      console.warn('[Notification] 本地图片读取失败，发送带链接的文本消息')

      let fallbackMessage = buildTelegramMessage(payload, true)
      fallbackMessage += `\n\n🔗 [查看图片](${imageUrl})`

      await bot.sendMessage(chatId, fallbackMessage, {
        parse_mode: 'Markdown',
        disable_web_page_preview: false
      })
    } else {
      // 没有有效图片URL时，发送普通文本消息
      const message = buildTelegramMessage(payload, true)
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' })
    }

    console.log('[Notification] Telegram 通知发送成功:', payload.title)
    return { success: true }
  } catch (error) {
    console.error('[Notification] Telegram 发送失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 转义 Telegram Markdown 特殊字符
 * 注意：Telegram 的 Markdown 模式只需要转义少量字符
 * 参考：https://core.telegram.org/bots/api#markdown-style
 */
function escapeMarkdown(text) {
  if (!text) return ''
  // 在 Telegram Markdown 模式下，只需要转义 _ * ` [ 这几个字符
  return String(text).replace(/([_*`\[])/g, '\\$1')
}

/**
 * 生成邮件 HTML 模板
 */
function generateEmailTemplate(content) {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: #ffffff;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
    }
    .header {
      border-bottom: 2px solid #007bff;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .header h1 {
      margin: 0;
      color: #007bff;
      font-size: 24px;
    }
    .content {
      padding: 10px 0;
    }
    .footer {
      margin-top: 30px;
      padding-top: 15px;
      border-top: 1px solid #eee;
      font-size: 12px;
      color: #666;
      text-align: center;
    }
    .info-item {
      padding: 8px 0;
      border-bottom: 1px solid #f0f0f0;
    }
    .info-item:last-child {
      border-bottom: none;
    }
    .info-label {
      font-weight: 600;
      color: #555;
    }
    .info-value {
      color: #333;
    }
  </style>
</head>
<body>
  <div class="container">
    ${content}
    <div class="footer">
      <p>此邮件由 EasyImg 图床系统自动发送</p>
    </div>
  </div>
</body>
</html>
  `
}

/**
 * 发送 Email 通知
 */
async function sendEmailNotification(config, payload) {
  const { email } = config

  if (!email.service || !email.user || !email.pass) {
    console.warn('[Notification] Email 配置不完整')
    return { success: false, error: 'Email 配置不完整（需要 service、user、pass）' }
  }

  try {
    console.log('[Notification] 邮件通知预发送:', payload.title)

    // 创建邮件传输器
    const transporter = nodemailer.createTransport({
      service: email.service,
      auth: {
        user: email.user,
        pass: email.pass
      }
    })

    // 检查是否有有效的图片URL
    const imageUrl = payload.data?.url || payload.data?.imageUrl
    const hasValidImageUrl = isValidImageUrl(imageUrl)

    // 构建邮件内容
    let htmlContent = `
      <div class="header">
        <h1>${payload.title}</h1>
      </div>
      <div class="content">
        <p>${payload.message}</p>
    `

    // 如果有有效的图片URL，在邮件中显示图片
    if (hasValidImageUrl) {
      htmlContent += `
        <div style="margin-top: 20px; text-align: center;">
          <img src="${imageUrl}" alt="上传的图片" style="max-width: 100%; max-height: 400px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);" />
          <p style="margin-top: 10px; font-size: 12px; color: #666;">
            <a href="${imageUrl}" target="_blank" style="color: #007bff;">点击查看原图</a>
          </p>
        </div>
      `
    }

    // 如果有额外数据，添加到邮件中
    if (payload.data && Object.keys(payload.data).length > 0) {
      htmlContent += '<div style="margin-top: 20px;"><h3>详细信息</h3>'
      for (const [key, value] of Object.entries(payload.data)) {
        // 跳过图片URL，因为已经显示了图片
        if (key === 'url' || key === 'imageUrl') continue
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : value
        htmlContent += `
          <div class="info-item">
            <span class="info-label">${key}:</span>
            <span class="info-value">${displayValue}</span>
          </div>
        `
      }
      htmlContent += '</div>'
    }

    htmlContent += '</div>'

    // 收件人地址，默认发送给自己
    const toAddress = email.to || email.user

    // 发送邮件
    await transporter.sendMail({
      from: email.user,
      to: toAddress,
      subject: `[EasyImg] ${payload.title}`,
      html: generateEmailTemplate(htmlContent)
    })

    console.log('[Notification] 邮件通知发送成功:', payload.title)
    return { success: true }
  } catch (error) {
    console.error('[Notification] 邮件发送失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 发送 Server酱 通知
 */
async function sendServerChanNotification(config, payload) {
  const { serverchan } = config

  if (!serverchan.sendKey) {
    console.warn('[Notification] Server酱 SendKey 未配置')
    return { success: false, error: 'Server酱 SendKey 未配置' }
  }

  try {
    console.log('[Notification] Server酱通知预发送:', payload.title)

    const url = `https://sctapi.ftqq.com/${serverchan.sendKey}.send`

    // 检查是否有有效的图片URL
    const imageUrl = payload.data?.url || payload.data?.imageUrl
    const hasValidImageUrl = isValidImageUrl(imageUrl)

    // 构建消息内容（Markdown 格式）
    let content = payload.message

    // 如果有有效的图片URL，使用 Markdown 语法显示图片
    if (hasValidImageUrl) {
      content += `\n\n![图片预览](${imageUrl})`
    }

    // 如果有额外数据，添加到消息中
    if (payload.data && Object.keys(payload.data).length > 0) {
      content += '\n\n### 详细信息\n'
      for (const [key, value] of Object.entries(payload.data)) {
        // 跳过图片URL，因为已经显示了图片
        if (key === 'url' || key === 'imageUrl') continue
        const displayValue = typeof value === 'object' ? JSON.stringify(value) : value
        content += `\n- **${key}**: ${displayValue}`
      }
    }

    // 发送请求
    const params = new URLSearchParams({
      text: payload.title,
      desp: content
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    })

    const data = await response.json()

    if (data.code !== 0) {
      console.error('[Notification] Server酱发送失败:', data)
      return { success: false, error: data.message || 'Server酱发送失败' }
    }

    console.log('[Notification] Server酱通知发送成功:', payload.title)
    return { success: true }
  } catch (error) {
    console.error('[Notification] Server酱发送失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 发送通知
 * @param {string} type - 通知类型
 * @param {object} payload - 通知内容
 */
export async function sendNotification(type, payload) {
  try {
    const config = await getNotificationConfig()

    // 检查通知是否启用
    if (!config.enabled) {
      return { success: true, skipped: true, reason: '通知功能未启用' }
    }

    // 检查该类型通知是否启用
    if (!config.types[type]) {
      return { success: true, skipped: true, reason: `${type} 类型通知未启用` }
    }

    // 根据通知方式发送
    switch (config.method) {
      case NOTIFICATION_METHODS.WEBHOOK:
        return await sendWebhookNotification(config, {
          type,
          ...payload,
          timestamp: new Date().toISOString()
        })

      case NOTIFICATION_METHODS.TELEGRAM:
        return await sendTelegramNotification(config, {
          type,
          ...payload,
          timestamp: new Date().toISOString()
        })

      case NOTIFICATION_METHODS.EMAIL:
        return await sendEmailNotification(config, {
          type,
          ...payload,
          timestamp: new Date().toISOString()
        })

      case NOTIFICATION_METHODS.SERVERCHAN:
        return await sendServerChanNotification(config, {
          type,
          ...payload,
          timestamp: new Date().toISOString()
        })

      default:
        return { success: false, error: `不支持的通知方式: ${config.method}` }
    }
  } catch (error) {
    console.error('[Notification] 发送通知失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 发送登录通知
 */
export async function sendLoginNotification(username, ip, userAgent) {
  return sendNotification(NOTIFICATION_TYPES.LOGIN, {
    title: '登录通知',
    message: `用户 ${username} 已登录`,
    data: {
      username,
      ip,
      userAgent,
      loginTime: new Date().toISOString()
    }
  })
}

/**
 * 发送上传通知
 */
export async function sendUploadNotification(imageInfo, uploaderInfo) {
  return sendNotification(NOTIFICATION_TYPES.UPLOAD, {
    title: '图片上传通知',
    message: `新图片已上传: ${imageInfo.filename}`,
    data: {
      imageId: imageInfo.id,
      filename: imageInfo.filename,
      format: imageInfo.format,
      size: imageInfo.size,
      url: imageInfo.url,
      uploader: uploaderInfo.name,
      uploaderType: uploaderInfo.type,
      ip: uploaderInfo.ip,
      uploadTime: new Date().toISOString()
    }
  })
}

/**
 * 发送鉴黄检测结果通知
 */
export async function sendNsfwNotification(imageInfo, moderationResult) {
  const isNsfw = moderationResult.isNsfw
  return sendNotification(NOTIFICATION_TYPES.NSFW_DETECTED, {
    title: isNsfw ? '⚠️ 检测到违规图片' : '图片审核通过',
    message: isNsfw
      ? `图片 ${imageInfo.filename} 被检测为违规内容`
      : `图片 ${imageInfo.filename} 审核通过`,
    data: {
      imageId: imageInfo.id,
      filename: imageInfo.filename,
      url: imageInfo.url,
      isNsfw,
      score: moderationResult.score,
      provider: moderationResult.provider,
      checkTime: new Date().toISOString()
    }
  })
}

/**
 * 测试 Webhook 连接
 */
export async function testWebhook(webhookConfig) {
  try {
    const testPayload = {
      type: 'test',
      title: '测试通知',
      message: '这是一条测试通知，用于验证 Webhook 配置是否正确。',
      timestamp: new Date().toISOString(),
      data: { test: true }
    }

    // 替换模板变量
    let body = webhookConfig.bodyTemplate
    body = replaceTemplateVariables(body, testPayload)

    const headers = {
      'Content-Type': webhookConfig.contentType || 'application/json',
      ...webhookConfig.headers
    }

    const response = await fetch(webhookConfig.url, {
      method: webhookConfig.method || 'POST',
      headers,
      body
    })

    if (!response.ok) {
      const errorText = await response.text()
      return {
        success: false,
        error: `HTTP ${response.status}: ${errorText.substring(0, 200)}`
      }
    }

    return { success: true, message: '测试通知发送成功' }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

/**
 * 测试 Telegram 连接
 */
export async function testTelegram(telegramConfig) {
  try {
    if (!telegramConfig.token || !telegramConfig.chatId) {
      return { success: false, error: '请提供 Token 和 Chat ID' }
    }

    console.log('[Notification] Telegram 测试通知预发送')

    const message = `*测试通知*\n这是一条测试通知，用于验证 Telegram 配置是否正确。\n\n_发送时间: ${new Date().toISOString()}_`

    // 使用 node-telegram-bot-api 发送消息
    const bot = new TelegramBot(telegramConfig.token)
    await bot.sendMessage(Number(telegramConfig.chatId), message, { parse_mode: 'Markdown' })

    console.log('[Notification] Telegram 测试通知发送成功')
    return { success: true, message: '测试通知发送成功' }
  } catch (error) {
    console.error('[Notification] Telegram 测试失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 测试 Email 连接
 */
export async function testEmail(emailConfig) {
  try {
    if (!emailConfig.service || !emailConfig.user || !emailConfig.pass) {
      return { success: false, error: '请提供完整的邮件配置（service、user、pass）' }
    }

    console.log('[Notification] Email 测试通知预发送')

    // 创建邮件传输器
    const transporter = nodemailer.createTransport({
      service: emailConfig.service,
      auth: {
        user: emailConfig.user,
        pass: emailConfig.pass
      }
    })

    // 收件人地址，默认发送给自己
    const toAddress = emailConfig.to || emailConfig.user

    const htmlContent = `
      <div class="header">
        <h1>测试通知</h1>
      </div>
      <div class="content">
        <p>这是一条测试通知，用于验证邮件配置是否正确。</p>
        <div class="info-item">
          <span class="info-label">发送时间:</span>
          <span class="info-value">${new Date().toISOString()}</span>
        </div>
      </div>
    `

    await transporter.sendMail({
      from: emailConfig.user,
      to: toAddress,
      subject: '[EasyImg] 测试通知',
      html: generateEmailTemplate(htmlContent)
    })

    console.log('[Notification] Email 测试通知发送成功')
    return { success: true, message: '测试通知发送成功' }
  } catch (error) {
    console.error('[Notification] Email 测试失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 测试 Server酱 连接
 */
export async function testServerChan(serverchanConfig) {
  try {
    if (!serverchanConfig.sendKey) {
      return { success: false, error: '请提供 Server酱 SendKey' }
    }

    console.log('[Notification] Server酱测试通知预发送')

    const url = `https://sctapi.ftqq.com/${serverchanConfig.sendKey}.send`

    const content = `这是一条测试通知，用于验证 Server酱 配置是否正确。\n\n发送时间: ${new Date().toISOString()}`

    const params = new URLSearchParams({
      text: '测试通知',
      desp: content
    })

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params
    })

    const data = await response.json()

    if (data.code !== 0) {
      console.error('[Notification] Server酱测试失败:', data)
      return { success: false, error: data.message || 'Server酱发送失败' }
    }

    console.log('[Notification] Server酱测试通知发送成功')
    return { success: true, message: '测试通知发送成功' }
  } catch (error) {
    console.error('[Notification] Server酱测试失败:', error)
    return { success: false, error: error.message }
  }
}

export default {
  NOTIFICATION_TYPES,
  NOTIFICATION_METHODS,
  getDefaultNotificationConfig,
  getNotificationConfig,
  saveNotificationConfig,
  sendNotification,
  sendLoginNotification,
  sendUploadNotification,
  sendNsfwNotification,
  testWebhook,
  testTelegram,
  testEmail,
  testServerChan
}