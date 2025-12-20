import db from '../../utils/db.js'
import { processImage, getImageMetadata, saveUploadedFile } from '../../utils/image.js'
import { authMiddleware } from '../../utils/authMiddleware.js'
import { v4 as uuidv4 } from 'uuid'

export default defineEventHandler(async (event) => {
  const clientIP = getRequestIP(event, { xForwardedFor: true }) || 'unknown'

  try {
    // 验证登录状态（仅端内调用，不使用API Key）
    await authMiddleware(event)
    const user = event.context.user

    // 解析请求体
    const body = await readBody(event)
    const { url } = body

    if (!url) {
      throw createError({
        statusCode: 400,
        message: '请提供图片URL'
      })
    }

    // 验证URL格式
    let imageUrl
    try {
      imageUrl = new URL(url)
      if (!['http:', 'https:'].includes(imageUrl.protocol)) {
        throw new Error('协议不支持')
      }
    } catch (e) {
      throw createError({
        statusCode: 400,
        message: '无效的URL格式'
      })
    }

    // 获取私有 API 配置
    const configDoc = await db.settings.findOne({ key: 'privateApiConfig' })
    const config = configDoc?.value || {}

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
        throw createError({
          statusCode: 408,
          message: '下载超时，请稍后重试'
        })
      }
      throw createError({
        statusCode: 400,
        message: `无法下载图片: ${e.message}`
      })
    }

    // 检查 Content-Type
    const contentType = response.headers.get('content-type') || ''
    if (!contentType.startsWith('image/')) {
      throw createError({
        statusCode: 400,
        message: 'URL指向的不是有效的图片'
      })
    }

    // 获取图片数据
    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    // 检查文件大小
    const maxFileSize = config.maxFileSize || 100 * 1024 * 1024
    if (buffer.length > maxFileSize) {
      throw createError({
        statusCode: 400,
        message: `图片大小超过限制 (最大 ${Math.round(maxFileSize / 1024 / 1024)}MB)`
      })
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

    console.error('[Upload] URL上传失败:', error)
    throw createError({
      statusCode: 500,
      message: '上传失败，请稍后重试'
    })
  }
})