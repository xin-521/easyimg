import db from '../../utils/db.js'
import { processImage, getImageMetadata, saveUploadedFile } from '../../utils/image.js'
import { authMiddleware } from '../../utils/authMiddleware.js'
import { v4 as uuidv4 } from 'uuid'

// 下载单个URL的图片
async function downloadAndSaveImage(url, config, user, clientIP) {
  // 验证URL格式
  let imageUrl
  try {
    imageUrl = new URL(url)
    if (!['http:', 'https:'].includes(imageUrl.protocol)) {
      throw new Error('协议不支持')
    }
  } catch (e) {
    throw new Error('无效的URL格式')
  }

  // 下载图片
  let response
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30秒超时

    // 构建请求头，绕过防盗链检测
    const fetchHeaders = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Not_A Brand";v="8", "Chromium";v="120", "Google Chrome";v="120"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'image',
      'Sec-Fetch-Mode': 'no-cors',
      'Sec-Fetch-Site': 'cross-site',
      // 使用图片URL的origin作为Referer，绕过防盗链
      'Referer': imageUrl.origin + '/',
      'Origin': imageUrl.origin
    }

    response = await fetch(url, {
      signal: controller.signal,
      headers: fetchHeaders,
      redirect: 'follow' // 自动跟随重定向
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error('下载超时，请稍后重试')
    }
    throw new Error(`无法下载图片: ${e.message}`)
  }

  // 检查 Content-Type
  const contentType = response.headers.get('content-type') || ''
  if (!contentType.startsWith('image/')) {
    throw new Error('URL指向的不是有效的图片')
  }

  // 获取图片数据
  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // 检查文件大小
  const maxFileSize = config.maxFileSize || 100 * 1024 * 1024
  if (buffer.length > maxFileSize) {
    throw new Error(`图片大小超过限制 (最大 ${Math.round(maxFileSize / 1024 / 1024)}MB)`)
  }

  // 从URL或Content-Type推断文件格式
  let fileExt = ''
  const urlPath = imageUrl.pathname.toLowerCase()
  const extMatch = urlPath.match(/\.([a-z0-9]+)$/i)
  if (extMatch) {
    fileExt = extMatch[1]
  } else {
    // 从 Content-Type 推断
    const mimeToExt = {
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/png': 'png',
      'image/gif': 'gif',
      'image/webp': 'webp',
      'image/avif': 'avif',
      'image/svg+xml': 'svg',
      'image/bmp': 'bmp',
      'image/x-icon': 'ico',
      'image/apng': 'apng',
      'image/tiff': 'tiff'
    }
    fileExt = mimeToExt[contentType.split(';')[0]] || 'jpg'
  }

  // 生成 UUID
  const imageUuid = uuidv4()

  // 处理图片（可选转换为 WebP）
  let processedBuffer = buffer
  let finalFormat = fileExt
  let isWebp = false

  if (config.convertToWebp && fileExt !== 'gif') {
    processedBuffer = await processImage(buffer, {
      format: 'webp',
      quality: 90 // 私有 API 使用更高质量
    })
    finalFormat = 'webp'
    isWebp = true
  }

  // 获取图片元数据
  const metadata = await getImageMetadata(processedBuffer)

  // 保存文件
  const filename = `${imageUuid}.${finalFormat}`
  await saveUploadedFile(processedBuffer, filename)

  // 从URL提取原始文件名
  let originalName = imageUrl.pathname.split('/').pop() || 'image'
  if (!originalName.includes('.')) {
    originalName += `.${fileExt}`
  }

  // 保存到数据库
  const imageDoc = {
    uuid: imageUuid,
    originalName: originalName,
    filename: filename,
    format: finalFormat,
    size: processedBuffer.length,
    width: metadata.width || 0,
    height: metadata.height || 0,
    isWebp: isWebp,
    isDeleted: false,
    uploadedBy: user.username || '管理员',
    uploadedByType: 'url', // 标记为URL上传
    sourceUrl: url, // 保存原始URL
    ip: clientIP,
    uploadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  const insertResult = await db.images.insert(imageDoc)
  const imageId = insertResult._id

  return {
    id: imageId,
    uuid: imageUuid,
    filename: filename,
    format: finalFormat,
    size: processedBuffer.length,
    width: metadata.width || 0,
    height: metadata.height || 0,
    url: `/i/${imageUuid}.${finalFormat}`,
    uploadedAt: imageDoc.uploadedAt
  }
}

export default defineEventHandler(async (event) => {
  const clientIP = getRequestIP(event, { xForwardedFor: true }) || 'unknown'

  try {
    // 验证登录状态（仅端内调用，不使用API Key）
    await authMiddleware(event)
    const user = event.context.user

    // 解析请求体
    const body = await readBody(event)
    const { urls } = body

    if (!urls || !Array.isArray(urls) || urls.length === 0) {
      throw createError({
        statusCode: 400,
        message: '请提供图片URL列表'
      })
    }

    // 过滤空URL并自动去重
    const validUrls = [...new Set(urls.map(u => u.trim()).filter(u => u.length > 0))]
    if (validUrls.length === 0) {
      throw createError({
        statusCode: 400,
        message: '请提供有效的图片URL'
      })
    }

    // 获取私有 API 配置
    const configDoc = await db.settings.findOne({ key: 'privateApiConfig' })
    const config = configDoc?.value || {}

    // 设置SSE响应头
    setHeader(event, 'Content-Type', 'text/event-stream')
    setHeader(event, 'Cache-Control', 'no-cache')
    setHeader(event, 'Connection', 'keep-alive')
    setHeader(event, 'X-Accel-Buffering', 'no') // 禁用nginx缓冲

    const responseStream = event.node.res

    // 发送SSE事件的辅助函数
    const sendEvent = (eventType, data) => {
      const eventData = JSON.stringify(data)
      responseStream.write(`event: ${eventType}\n`)
      responseStream.write(`data: ${eventData}\n\n`)
    }

    // 发送开始事件
    sendEvent('start', {
      total: validUrls.length,
      message: '开始下载图片'
    })

    const results = []
    let successCount = 0
    let failCount = 0

    // 串行下载每个URL
    for (let i = 0; i < validUrls.length; i++) {
      const url = validUrls[i]
      const index = i + 1

      // 发送进度事件 - 开始下载
      sendEvent('progress', {
        index,
        total: validUrls.length,
        url,
        status: 'downloading',
        message: `正在下载第 ${index}/${validUrls.length} 张图片`
      })

      try {
        const result = await downloadAndSaveImage(url, config, user, clientIP)
        successCount++
        results.push({
          url,
          success: true,
          data: result
        })

        // 发送进度事件 - 下载成功
        sendEvent('progress', {
          index,
          total: validUrls.length,
          url,
          status: 'success',
          message: `第 ${index}/${validUrls.length} 张图片下载成功`,
          data: result
        })
      } catch (error) {
        failCount++
        const errorMessage = error.message || '下载失败'
        results.push({
          url,
          success: false,
          error: errorMessage
        })

        // 发送进度事件 - 下载失败
        sendEvent('progress', {
          index,
          total: validUrls.length,
          url,
          status: 'error',
          message: `第 ${index}/${validUrls.length} 张图片下载失败: ${errorMessage}`,
          error: errorMessage
        })
      }

      // 短暂延迟，避免请求过快
      if (i < validUrls.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100))
      }
    }

    // 发送完成事件
    sendEvent('complete', {
      total: validUrls.length,
      successCount,
      failCount,
      message: `下载完成：成功 ${successCount} 张，失败 ${failCount} 张`,
      results
    })

    // 结束响应
    responseStream.end()

  } catch (error) {
    // 如果是在SSE开始之前发生的错误，返回普通JSON错误
    if (!event.node.res.headersSent) {
      if (error.statusCode) {
        throw error
      }

      console.error('[Upload] 批量URL上传失败:', error)
      throw createError({
        statusCode: 500,
        message: '上传失败，请稍后重试'
      })
    } else {
      // SSE已经开始，发送错误事件并结束
      const responseStream = event.node.res
      const errorData = JSON.stringify({
        error: error.message || '上传失败',
        message: '上传过程中发生错误'
      })
      responseStream.write(`event: error\n`)
      responseStream.write(`data: ${errorData}\n\n`)
      responseStream.end()
    }
  }
})