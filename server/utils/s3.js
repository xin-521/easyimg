import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

// S3 配置
const s3Config = {
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ''
  },
  endpoint: process.env.S3_ENDPOINT || undefined, // 用于兼容 S3 的服务，如 MinIO
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true' // 用于兼容 S3 的服务
}

// S3 存储桶配置
const bucketName = process.env.S3_BUCKET_NAME || 'easyimg-images'
const baseUrl = process.env.S3_BASE_URL || '' // CDN 或自定义域名前缀

// 创建 S3 客户端
const s3Client = new S3Client(s3Config)

console.log('[S3 Storage] 初始化 S3 存储，存储桶:', bucketName)

// 测试 S3 连接状态
export async function testS3Connection() {
  try {
    console.log('[S3 Storage] 正在测试 S3 连接...')
    const startTime = Date.now()
    
    // 尝试列出存储桶中的对象（限制为1个）来测试连接
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: 'connection-test' // 使用一个不存在的键来测试访问权限
    })
    
    try {
      await s3Client.send(command)
    } catch (error) {
      // 如果是 NoSuchKey 错误，说明连接是正常的，只是文件不存在
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        const connectTime = Date.now() - startTime
        console.log('[S3 Storage] ✅ S3 连接成功 (响应时间: ' + connectTime + 'ms)')
        console.log('[S3 Storage] 配置信息:', {
          region: s3Config.region,
          endpoint: s3Config.endpoint || 'AWS S3 默认端点',
          forcePathStyle: s3Config.forcePathStyle,
          bucketName: bucketName
        })
        return true
      }
      throw error // 其他错误需要抛出
    }
    
    const connectTime = Date.now() - startTime
    console.log('[S3 Storage] ✅ S3 连接成功 (响应时间: ' + connectTime + 'ms)')
    console.log('[S3 Storage] 配置信息:', {
      region: s3Config.region,
      endpoint: s3Config.endpoint || 'AWS S3 默认端点',
      forcePathStyle: s3Config.forcePathStyle,
      bucketName: bucketName
    })
    return true
  } catch (error) {
    console.error('[S3 Storage] ❌ S3 连接失败:', error.message)
    console.error('[S3 Storage] 连接配置:', {
      region: s3Config.region,
      endpoint: s3Config.endpoint || 'AWS S3 默认端点',
      forcePathStyle: s3Config.forcePathStyle,
      bucketName: bucketName,
      accessKeyId: s3Config.credentials.accessKeyId ? '***已配置***' : '***未配置***'
    })
    return false
  }
}

// 立即测试连接（异步执行，不阻塞启动）
testS3Connection().catch(error => {
  console.error('[S3 Storage] 启动时连接测试失败:', error.message)
})

/**
 * 上传文件到 S3
 * @param {Buffer} buffer - 文件内容
 * @param {string} key - S3 对象键（文件名）
 * @param {string} contentType - 文件 MIME 类型
 * @returns {Promise<string>} 文件的公共访问 URL
 */
export async function uploadFileToS3(buffer, key, contentType) {
  try {
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType
    })

    await s3Client.send(command)
    
    // 返回文件的公共访问 URL
    if (baseUrl) {
      return `${baseUrl}/${key}`
    }
    
    // 如果没有配置自定义域名，尝试使用 S3 默认 URL
    const endpoint = s3Config.endpoint
    if (endpoint) {
      // 对于自定义端点（如七牛云）
      if (s3Config.forcePathStyle) {
        // 七牛云等使用路径样式的服务
        return `${endpoint}/${bucketName}/${key}`
      } else {
        // 其他S3兼容服务
        return `${endpoint}/${key}`
      }
    }
    
    // 对于 AWS S3
    return `https://${bucketName}.s3.${s3Config.region}.amazonaws.com/${key}`
  } catch (error) {
    console.error('[S3 Storage] 上传文件失败:', error)
    throw new Error(`S3 上传失败: ${error.message}`)
  }
}

/**
 * 从 S3 获取文件
 * @param {string} key - S3 对象键（文件名）
 * @returns {Promise<Buffer>} 文件内容
 */
export async function getFileFromS3(key) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    })

    const response = await s3Client.send(command)
    
    // 将响应流转换为 Buffer
    const chunks = []
    for await (const chunk of response.Body) {
      chunks.push(chunk)
    }
    return Buffer.concat(chunks)
  } catch (error) {
    console.error('[S3 Storage] 获取文件失败:', error)
    throw new Error(`S3 获取文件失败: ${error.message}`)
  }
}

/**
 * 从 S3 删除文件
 * @param {string} key - S3 对象键（文件名）
 * @returns {Promise<boolean>} 是否删除成功
 */
export async function deleteFileFromS3(key) {
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: key
    })

    await s3Client.send(command)
    return true
  } catch (error) {
    console.error('[S3 Storage] 删除文件失败:', error)
    throw new Error(`S3 删除文件失败: ${error.message}`)
  }
}

/**
 * 生成预签名 URL（用于私有访问）
 * @param {string} key - S3 对象键（文件名）
 * @param {number} expiresIn - 过期时间（秒），默认 3600 秒（1小时）
 * @returns {Promise<string>} 预签名 URL
 */
export async function getPresignedUrl(key, expiresIn = 3600) {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: key
    })

    return await getSignedUrl(s3Client, command, { expiresIn })
  } catch (error) {
    console.error('[S3 Storage] 生成预签名 URL 失败:', error)
    throw new Error(`生成预签名 URL 失败: ${error.message}`)
  }
}

/**
 * 获取文件的公共访问 URL
 * @param {string} key - S3 对象键（文件名）
 * @returns {string} 文件的公共访问 URL
 */
export function getPublicUrl(key) {
  if (baseUrl) {
    return `${baseUrl}/${key}`
  }
  
  // 如果没有配置自定义域名，尝试使用 S3 默认 URL
  const endpoint = s3Config.endpoint
  if (endpoint) {
    // 对于自定义端点（如七牛云）
    if (s3Config.forcePathStyle) {
      // 七牛云等使用路径样式的服务
      return `${endpoint}/${bucketName}/${key}`
    } else {
      // 其他S3兼容服务
      return `${endpoint}/${key}`
    }
  }
  
  // 对于 AWS S3
  return `https://${bucketName}.s3.${s3Config.region}.amazonaws.com/${key}`
}

export default {
  uploadFileToS3,
  getFileFromS3,
  deleteFileFromS3,
  getPresignedUrl,
  getPublicUrl,
  testS3Connection
}