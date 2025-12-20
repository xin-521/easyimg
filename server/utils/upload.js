import { existsSync } from 'fs'
import { join } from 'path'
import { v4 as uuidv4 } from 'uuid'
import { ObjectId } from 'mongodb'
import { processImage, getImageMetadata } from './image.js'
import { uploadFileToS3, deleteFileFromS3, getPublicUrl } from './s3.js'
import db from './db.js'

/**
 * 解析 multipart/form-data 请求
 */
export async function parseFormData(event) {
  const formData = await readMultipartFormData(event)

  if (!formData || formData.length === 0) {
    return { file: null }
  }

  // 查找文件字段
  const fileField = formData.find(field => field.name === 'file' || field.name === 'image')

  if (!fileField || !fileField.data) {
    return { file: null }
  }

  return {
    file: {
      buffer: fileField.data,
      originalFilename: fileField.filename || 'unknown',
      mimetype: fileField.type,
      size: fileField.data.length
    }
  }
}

/**
 * 获取文件扩展名（内部使用）
 */
function getFileExtension(filename) {
  const ext = filename.split('.').pop().toLowerCase()
  return ext
}

/**
 * 验证文件格式
 */
export function validateFormat(filename, allowedFormats) {
  const ext = getFileExtension(filename)
  return allowedFormats.map(f => f.toLowerCase()).includes(ext)
}

/**
 * 验证文件大小
 */
export function validateSize(size, maxSize) {
  return size <= maxSize
}

/**
 * 保存图片文件到 S3
 * @param {Buffer} buffer - 图片数据
 * @param {Object} options - 配置选项
 * @param {string} options.originalName - 原始文件名
 * @param {boolean} options.convertToWebp - 是否转换为 WebP
 * @param {number} options.webpQuality - WebP 质量
 * @param {string} options.uploadedBy - 上传者
 * @param {string} options.ip - 上传者 IP
 * @param {boolean} options.isPublic - 是否为公共上传
 */
export async function saveUploadedImage(buffer, options) {
  const {
    originalName,
    convertToWebp = false,
    webpQuality = 80,
    uploadedBy = '访客',
    ip = '',
    isPublic = true
  } = options

  const uuid = uuidv4()
  const originalExt = getFileExtension(originalName)

  let finalBuffer = buffer
  let finalExt = originalExt
  let isWebp = false

  // 如果需要转换为 WebP
  if (convertToWebp && originalExt !== 'gif') {
    finalBuffer = await processImage(buffer, {
      format: 'webp',
      quality: webpQuality
    })
    finalExt = 'webp'
    isWebp = true
  }

  // 获取图片信息
  const imageInfo = await getImageMetadata(finalBuffer)

  // 生成文件名
  const filename = `${uuid}.${finalExt}`

  // 根据 MIME 类型映射
  const mimeTypes = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    'svg': 'image/svg+xml',
    'avif': 'image/avif',
    'tiff': 'image/tiff',
    'tif': 'image/tiff'
  }
  
  const contentType = mimeTypes[finalExt] || 'application/octet-stream'

  // 上传到 S3
  await uploadFileToS3(finalBuffer, filename, contentType)

  // 保存到数据库
  const imageRecord = {
    _id: new ObjectId(),
    uuid,
    originalName,
    filename,
    size: finalBuffer.length,
    format: finalExt,
    width: imageInfo.width,
    height: imageInfo.height,
    isWebp,
    isPublic,
    uploadedBy,
    ip,
    isDeleted: false,
    uploadedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  await db.images.insert(imageRecord)

  // 返回图片信息（不包含敏感信息）
  return {
    uuid,
    filename,
    format: finalExt,
    size: finalBuffer.length,
    width: imageInfo.width,
    height: imageInfo.height,
    url: `/i/${uuid}.${finalExt}`
  }
}

/**
 * 删除 S3 中的图片文件
 */
export async function deleteImageFile(filename) {
  try {
    await deleteFileFromS3(filename)
    return true
  } catch (error) {
    console.error('删除图片文件失败:', error)
    return false
  }
}

/**
 * 获取图片文件的公共访问 URL
 */
export function getImagePath(filename) {
  return getPublicUrl(filename)
}

/**
 * 获取上传目录路径（已弃用，保留用于兼容性）
 */
export function getUploadsDirPath() {
  console.warn('[Upload] getUploadsDirPath 已弃用：现在使用 S3 存储')
  return 's3://'
}
