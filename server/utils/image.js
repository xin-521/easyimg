import sharp from 'sharp'
import { v4 as uuidv4 } from 'uuid'
import { extname } from 'path'
import { uploadFileToS3, deleteFileFromS3, getPublicUrl } from './s3.js'

// 支持的图片格式
export const COMMON_FORMATS = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'apng', 'tiff', 'tif']
export const ALL_FORMATS = ['jpeg', 'jpg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'apng', 'tiff', 'tif']

/**
 * 获取图片元信息
 */
export async function getImageMetadata(buffer) {
  try {
    const metadata = await sharp(buffer).metadata()
    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      size: buffer.length
    }
  } catch (error) {
    console.error('获取图片元信息失败:', error)
    return { width: 0, height: 0, format: 'unknown', size: buffer.length }
  }
}

/**
 * 处理图片（压缩/转换格式）
 */
export async function processImage(buffer, options = {}) {
  const { format = 'webp', quality = 80 } = options
  try {
    // GIF 不转换，保持原格式
    if (options.skipGif) {
      const metadata = await sharp(buffer).metadata()
      if (metadata.format === 'gif') {
        return buffer
      }
    }

    const processed = await sharp(buffer)
      .toFormat(format, { quality })
      .toBuffer()
    return processed
  } catch (error) {
    console.error('处理图片失败:', error)
    throw error
  }
}

/**
 * 保存上传的文件到 S3
 */
export async function saveUploadedFile(buffer, filename) {
  // 根据文件扩展名确定 MIME 类型
  const ext = extname(filename).toLowerCase().replace('.', '')
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
  
  const contentType = mimeTypes[ext] || 'application/octet-stream'
  
  // 上传到 S3
  await uploadFileToS3(buffer, filename, contentType)
  
  // 返回公共访问 URL
  return getPublicUrl(filename)
}

/**
 * 压缩并转换为 WebP
 */
export async function compressToWebP(buffer, quality = 80) {
  try {
    const compressed = await sharp(buffer)
      .webp({ quality })
      .toBuffer()
    return compressed
  } catch (error) {
    console.error('压缩图片失败:', error)
    throw error
  }
}

/**
 * 转换为 WebP（不压缩）
 */
export async function convertToWebP(buffer) {
  try {
    const converted = await sharp(buffer)
      .webp({ lossless: true })
      .toBuffer()
    return converted
  } catch (error) {
    console.error('转换图片失败:', error)
    throw error
  }
}

/**
 * 保存图片到 S3
 */
export async function saveImage(buffer, filename) {
  // 根据文件扩展名确定 MIME 类型
  const ext = extname(filename).toLowerCase().replace('.', '')
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
  
  const contentType = mimeTypes[ext] || 'application/octet-stream'
  
  // 上传到 S3
  await uploadFileToS3(buffer, filename, contentType)
  
  // 返回公共访问 URL
  return getPublicUrl(filename)
}

/**
 * 删除 S3 中的图片文件
 */
export async function deleteImage(filename) {
  try {
    await deleteFileFromS3(filename)
    return true
  } catch (error) {
    console.error('删除图片失败:', error)
    return false
  }
}

/**
 * 生成唯一文件名
 */
export function generateFilename(extension) {
  const uuid = uuidv4()
  return `${uuid}.${extension}`
}

/**
 * 获取文件扩展名
 */
export function getExtension(filename) {
  return extname(filename).toLowerCase().replace('.', '')
}

/**
 * 验证图片格式
 */
export function isValidFormat(format, allowedFormats) {
  return allowedFormats.map(f => f.toLowerCase()).includes(format.toLowerCase())
}

/**
 * 获取图片文件的公共访问 URL
 */
export function getImageFilePath(filename) {
  return getPublicUrl(filename)
}

export default {
  COMMON_FORMATS,
  ALL_FORMATS,
  getImageMetadata,
  compressToWebP,
  convertToWebP,
  saveImage,
  deleteImage,
  generateFilename,
  getExtension,
  isValidFormat
}
