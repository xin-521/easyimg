import db from '../../utils/db.js'
import { processImage, getImageMetadata, saveUploadedFile } from '../../utils/image.js'
import { parseFormData } from '../../utils/upload.js'
import { deleteFileFromS3 } from '../../utils/s3.js'
import { v4 as uuidv4 } from 'uuid'
import { sendUploadNotification } from '../../utils/notification.js'
import { getPublicUrl } from '../../utils/s3.js'

export default defineEventHandler(async (event) => {
  const clientIP = getRequestIP(event, { xForwardedFor: true }) || 'unknown'

  try {
    // 获取 ApiKey（从 header 或 query）
    const apiKey = getHeader(event, 'x-api-key') || getQuery(event).apiKey

    if (!apiKey) {
      throw createError({
        statusCode: 401,
        message: '缺少 API Key'
      })
    }

    // 验证 ApiKey
    const keyDoc = await db.apikeys.findOne({ key: apiKey, enabled: true })
    if (!keyDoc) {
      throw createError({
        statusCode: 401,
        message: 'API Key 无效或已禁用'
      })
    }

    // 获取私有 API 配置
    const configDoc = await db.settings.findOne({ key: 'privateApiConfig' })
    const config = configDoc?.value || {}

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

    // 私有 API 支持所有格式，只检查是否为图片
    const fileExt = file.originalFilename?.split('.').pop()?.toLowerCase() || ''

    // 检查文件大小
    const maxFileSize = config.maxFileSize || 100 * 1024 * 1024
    if (file.size > maxFileSize) {
      throw createError({
        statusCode: 400,
        message: `文件大小超过限制 (最大 ${Math.round(maxFileSize / 1024 / 1024)}MB)`
      })
    }

    // 生成 UUID
    const imageUuid = uuidv4()

    // 处理图片（可选转换为 WebP）
    let processedBuffer = file.buffer
    let finalFormat = fileExt
    let isWebp = false

    try {
      if (config.convertToWebp && fileExt !== 'gif') {
        processedBuffer = await processImage(file.buffer, {
          format: 'webp',
          quality: config.webpQuality || 80
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

    // 获取用户信息（通过 ApiKey 关联）
    const uploadedBy = keyDoc.name || 'API用户'

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
      uploadedBy: uploadedBy,
      uploadedByType: 'private',
      apiKeyId: keyDoc._id,
      ip: clientIP,
      uploadedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
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
        name: uploadedBy,
        type: 'private',
        ip: clientIP
      }
    ).catch(err => {
      console.error('[Upload] 发送上传通知失败:', err)
    })

    // 返回结果
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
    if (error.statusCode) {
      throw error
    }

    console.error('[Upload] 私有上传失败:', error)
    throw createError({
      statusCode: 500,
      message: '上传失败，请稍后重试'
    })
  }
})
