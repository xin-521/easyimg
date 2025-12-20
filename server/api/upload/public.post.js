import db from '../../utils/db.js'
import { processImage, getImageMetadata, saveUploadedFile } from '../../utils/image.js'
import { parseFormData } from '../../utils/upload.js'
import { deleteFileFromS3 } from '../../utils/s3.js'
import { v4 as uuidv4 } from 'uuid'
import {
  checkPublicRateLimit,
  checkPublicConcurrency,
  acquirePublicConcurrency,
  releasePublicConcurrency
} from '../../utils/rateLimit.js'
import { createModerationTask } from '../../utils/moderationQueue.js'
import { isBlacklisted } from '../../utils/ipBlacklist.js'
import { sendUploadNotification } from '../../utils/notification.js'
import { getPublicUrl } from '../../utils/s3.js'

export default defineEventHandler(async (event) => {
  const clientIP = getRequestIP(event, { xForwardedFor: true }) || 'unknown'
  let concurrencyAcquired = false

  try {
    // 检查 IP 是否在黑名单中
    if (await isBlacklisted(clientIP)) {
      throw createError({
        statusCode: 403,
        message: '您的 IP 已被禁止上传'
      })
    }

    // 获取公共 API 配置
    const configDoc = await db.settings.findOne({ key: 'publicApiConfig' })
    const config = configDoc?.value || {}

    // 检查公共 API 是否启用
    if (!config.enabled) {
      throw createError({
        statusCode: 403,
        message: '公共上传已禁用'
      })
    }

    // 检查频率限制
    const rateLimitResult = checkPublicRateLimit(clientIP, config.rateLimit || 10)
    if (!rateLimitResult.allowed) {
      throw createError({
        statusCode: 429,
        message: `请求过于频繁，请 ${rateLimitResult.retryAfter} 秒后重试`
      })
    }

    // 检查并发限制
    if (!config.allowConcurrent) {
      const concurrencyResult = checkPublicConcurrency(clientIP)
      if (!concurrencyResult.allowed) {
        throw createError({
          statusCode: 429,
          message: '请等待上一张图片上传完成'
        })
      }
      // 获取并发锁
      acquirePublicConcurrency(clientIP)
      concurrencyAcquired = true
    }

    // 解析表单数据
    let parseResult
    try {
      parseResult = await parseFormData(event)
    } catch (error) {
      throw createError({
        statusCode: 400,
        message: error.message || '文件解析失败'
      })
    }

    const { file } = parseResult
    if (!file) {
      throw createError({
        statusCode: 400,
        message: '请选择要上传的图片'
      })
    }

    // 验证文件有效性
    if (!file.buffer || file.buffer.length === 0) {
      throw createError({
        statusCode: 400,
        message: '上传的文件为空'
      })
    }

    // 检查文件格式
    const fileExt = file.originalFilename?.split('.').pop()?.toLowerCase() || ''
    const allowedFormats = config.allowedFormats || ['jpg', 'jpeg', 'png', 'gif', 'webp']
    if (!allowedFormats.includes(fileExt)) {
      throw createError({
        statusCode: 400,
        message: `不支持的图片格式，允许的格式: ${allowedFormats.join(', ')}`
      })
    }

    // 检查文件大小
    const maxFileSize = config.maxFileSize || 10 * 1024 * 1024
    if (file.size > maxFileSize) {
      throw createError({
        statusCode: 400,
        message: `文件大小超过限制 (最大 ${Math.round(maxFileSize / 1024 / 1024)}MB)`
      })
    }

    // 生成 UUID
    const imageUuid = uuidv4()

    // 处理图片（压缩和转换）
    let processedBuffer = file.buffer
    let finalFormat = fileExt
    let isWebp = false

    try {
      if (config.compressToWebp && fileExt !== 'gif') {
        const quality = config.webpQuality || 80
        processedBuffer = await processImage(file.buffer, {
          format: 'webp',
          quality: quality
        })
        finalFormat = 'webp'
        isWebp = true
      }
    } catch (error) {
      console.error('[Upload] 图片处理失败:', error)
      // 图片处理失败时使用原始文件
      processedBuffer = file.buffer
      finalFormat = fileExt
      isWebp = false
    }

    // 获取图片元数据
    let metadata = { width: 0, height: 0 }
    try {
      metadata = await getImageMetadata(processedBuffer)
    } catch (error) {
      console.error('[Upload] 获取图片元数据失败:', error)
    }

    // 保存文件到 S3
    const filename = `${imageUuid}.${finalFormat}`
    let imageUrl
    try {
      imageUrl = await saveUploadedFile(processedBuffer, filename)
    } catch (error) {
      console.error('[Upload] 保存文件失败:', error)
      throw createError({
        statusCode: 500,
        message: '文件保存失败，请稍后重试'
      })
    }

    // 判断是否启用内容安全检测
    const contentSafetyEnabled = config.contentSafety?.enabled || false

    // 保存到数据库
    const imageDoc = {
      uuid: imageUuid,
      originalName: file.originalFilename,
      filename: filename,
      format: finalFormat,
      size: processedBuffer.length,
      width: metadata.width || 0,
      height: metadata.height || 0,
      isWebp: isWebp,
      isDeleted: false,
      uploadedBy: '访客',
      uploadedByType: 'public',
      ip: clientIP,
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      // 内容审核相关字段
      moderationStatus: contentSafetyEnabled ? 'pending' : 'skipped',
      moderationResult: contentSafetyEnabled ? null : { skipped: true, reason: '内容安全检测未启用' },
      moderationChecked: !contentSafetyEnabled,
      isNsfw: false
    }

    let insertResult
    try {
      insertResult = await db.images.insert(imageDoc)
    } catch (error) {
      console.error('[Upload] 数据库保存失败:', error)
      // 尝试删除已上传的文件
      try {
        await deleteFileFromS3(filename)
      } catch (deleteError) {
        console.error('[Upload] 清理文件失败:', deleteError)
      }
      throw createError({
        statusCode: 500,
        message: '数据保存失败，请稍后重试'
      })
    }
    
    const imageId = insertResult._id

    // 如果启用了内容安全检测，创建审核任务
    if (contentSafetyEnabled) {
      try {
        await createModerationTask(imageId, imageUuid, filename)
      } catch (err) {
        console.error('[Upload] 创建审核任务失败:', err)
        // 审核任务创建失败不影响上传结果
      }
    }

    // 释放并发锁
    if (concurrencyAcquired) {
      releasePublicConcurrency(clientIP)
      concurrencyAcquired = false
    }

    // 获取站点 URL 配置，用于生成完整图片链接
    const appSettingsDoc = await db.settings.findOne({ key: 'appSettings' })
    let siteUrl = appSettingsDoc?.value?.siteUrl || ''

    // 如果没有配置站点 URL，使用请求的 Host 作为兜底
    if (!siteUrl) {
      const protocol = getHeader(event, 'x-forwarded-proto') || 'http'
      const host = getHeader(event, 'host') || 'localhost'
      siteUrl = `${protocol}://${host}`
    }

    // 移除末尾斜杠，确保 URL 拼接正确
    siteUrl = siteUrl.replace(/\/+$/, '')
    
    // 使用 S3 返回的 URL 或生成完整图片链接
    const fullImageUrl = imageUrl || `${siteUrl}/i/${imageUuid}.${finalFormat}`

    // 发送上传通知（异步，不阻塞响应）
    sendUploadNotification(
      {
        id: imageId,
        filename: filename,
        format: finalFormat,
        size: processedBuffer.length,
        url: fullImageUrl
      },
      {
        name: '访客',
        type: 'public',
        ip: clientIP
      }
    ).catch(err => {
      console.error('[Upload] 发送上传通知失败:', err)
    })

    // 返回结果（不包含敏感信息）
    return {
      success: true,
      message: '上传成功',
      data: {
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
  } catch (error) {
    // 确保释放并发锁
    if (concurrencyAcquired) {
      releasePublicConcurrency(clientIP)
    }

    if (error.statusCode) {
      throw error
    }

    console.error('[Upload] 公共上传失败:', error)
    throw createError({
      statusCode: 500,
      message: '上传失败，请稍后重试'
    })
  }
})
