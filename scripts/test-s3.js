#!/usr/bin/env node

/**
 * S3连接状态测试脚本
 * 用于测试S3连接是否正常工作
 */

import { S3Client, ListBucketsCommand, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadBucketCommand } from '@aws-sdk/client-s3'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 手动加载.env文件
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env')
    const envContent = readFileSync(envPath, 'utf8')
    
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim()
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...values] = trimmedLine.split('=')
        if (key && values.length > 0) {
          // 移除行内注释
          let value = values.join('=').trim()
          const commentIndex = value.indexOf(' #')
          if (commentIndex > -1) {
            value = value.substring(0, commentIndex).trim()
          }
          process.env[key.trim()] = value
        }
      }
    })
    
    console.log('已加载.env文件')
  } catch (error) {
    console.log('未找到.env文件，使用默认环境变量')
  }
}

// 加载环境变量
loadEnv()

// S3连接配置
const s3Config = {
  region: process.env.S3_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || ''
  },
  endpoint: process.env.S3_ENDPOINT || undefined, // 用于兼容 S3 的服务，如 MinIO
  forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true', // 用于兼容 S3 的服务
  // 添加更多兼容性选项
  tls: true,
  maxAttempts: 3,
  requestHandler: {
    httpsAgent: undefined
  }
}

// 对于七牛云等S3兼容服务，可能需要特殊处理
if (process.env.S3_ENDPOINT && process.env.S3_ENDPOINT.includes('qiniucs.com')) {
  console.log('检测到七牛云S3服务，应用特殊配置...')
  s3Config.forcePathStyle = true  // 七牛云通常需要强制路径样式
  s3Config.region = process.env.S3_REGION || 'us-east-1'
}

// S3 存储桶配置
const bucketName = process.env.S3_BUCKET_NAME || 'easyimg-images'

// 隐藏敏感信息的函数
function hideCredentials(config) {
  const hidden = { ...config }
  if (hidden.credentials) {
    hidden.credentials = {
      accessKeyId: hidden.credentials.accessKeyId ? `${hidden.credentials.accessKeyId.substring(0, 4)}***` : '',
      secretAccessKey: hidden.credentials.secretAccessKey ? '***' : ''
    }
  }
  return hidden
}

console.log('='.repeat(50))
console.log('S3 连接状态测试')
console.log('='.repeat(50))

async function testS3Connection() {
  try {
    console.log(`\n[1] 检查S3配置...`)
    console.log(`    区域: ${s3Config.region}`)
    console.log(`    访问密钥ID: ${s3Config.credentials.accessKeyId ? s3Config.credentials.accessKeyId.substring(0, 4) + '***' : '未设置'}`)
    console.log(`    密钥: ${s3Config.credentials.secretAccessKey ? '已设置' : '未设置'}`)
    console.log(`    端点: ${s3Config.endpoint || 'AWS S3默认'}`)
    console.log(`    强制路径样式: ${s3Config.forcePathStyle}`)
    console.log(`    存储桶名称: ${bucketName}`)
    
    if (!s3Config.credentials.accessKeyId || !s3Config.credentials.secretAccessKey) {
      throw new Error('S3访问密钥未设置，请检查S3_ACCESS_KEY_ID和S3_SECRET_ACCESS_KEY环境变量')
    }
    
    console.log(`\n[2] 创建S3客户端...`)
    const s3Client = new S3Client(s3Config)
    console.log(`    ✅ S3客户端创建成功`)
    
    // 测试列出存储桶
    console.log(`\n[3] 测试列出存储桶...`)
    let bucketsResponse = null
    let listTime = 0
    
    // 对于某些S3兼容服务（如七牛云），ListBuckets可能不支持
    if (process.env.S3_ENDPOINT && (process.env.S3_ENDPOINT.includes('qiniucs.com') || process.env.S3_ENDPOINT.includes('minio'))) {
      console.log(`    检测到S3兼容服务，跳过列出存储桶测试，直接测试指定存储桶...`)
    } else {
      try {
        const startTime = Date.now()
        const listBucketsCommand = new ListBucketsCommand({})
        bucketsResponse = await s3Client.send(listBucketsCommand)
        listTime = Date.now() - startTime
        
        console.log(`    ✅ 列出存储桶成功，耗时: ${listTime}ms`)
        console.log(`    存储桶数量: ${bucketsResponse.Buckets.length}`)
        
        const bucketExists = bucketsResponse.Buckets.some(bucket => bucket.Name === bucketName)
        if (bucketExists) {
          console.log(`    ✅ 目标存储桶 "${bucketName}" 存在`)
        } else {
          console.log(`    ⚠️ 目标存储桶 "${bucketName}" 不存在，将尝试创建`)
        }
      } catch (error) {
        console.log(`    ⚠️ 列出存储桶失败，可能不支持此操作: ${error.message}`)
        console.log(`    继续测试指定存储桶...`)
      }
    }
    
    // 测试存储桶访问权限
    console.log(`\n[4] 测试存储桶访问权限...`)
    let bucketExists = false
    if (bucketsResponse && bucketsResponse.Buckets) {
      bucketExists = bucketsResponse.Buckets.some(bucket => bucket.Name === bucketName)
    }
    
    try {
      const headBucketCommand = new HeadBucketCommand({ Bucket: bucketName })
      const headStartTime = Date.now()
      await s3Client.send(headBucketCommand)
      const headTime = Date.now() - headStartTime
      console.log(`    ✅ 存储桶访问权限验证成功，耗时: ${headTime}ms`)
      bucketExists = true  // 如果HeadBucket成功，说明存储桶存在
    } catch (error) {
      if (error.name === 'NoSuchBucket' && !bucketExists) {
        console.log(`    ⚠️ 存储桶不存在，可能需要手动创建`)
      } else {
        throw error
      }
    }
    
    // 测试上传文件
    console.log(`\n[5] 测试上传文件...`)
    const testKey = `test/connection-test-${Date.now()}.txt`
    const testContent = 'S3连接测试文件 - ' + new Date().toISOString()
    
    const putStartTime = Date.now()
    const putCommand = new PutObjectCommand({
      Bucket: bucketName,
      Key: testKey,
      Body: testContent,
      ContentType: 'text/plain'
    })
    
    await s3Client.send(putCommand)
    const putTime = Date.now() - putStartTime
    console.log(`    ✅ 文件上传成功，耗时: ${putTime}ms`)
    console.log(`    文件路径: ${testKey}`)
    
    // 测试下载文件
    console.log(`\n[6] 测试下载文件...`)
    const getStartTime = Date.now()
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: testKey
    })
    
    const getResponse = await s3Client.send(getCommand)
    const chunks = []
    for await (const chunk of getResponse.Body) {
      chunks.push(chunk)
    }
    const downloadedContent = Buffer.concat(chunks).toString()
    const getTime = Date.now() - getStartTime
    
    console.log(`    ✅ 文件下载成功，耗时: ${getTime}ms`)
    console.log(`    文件内容匹配: ${downloadedContent === testContent ? '是' : '否'}`)
    
    // 测试删除文件
    console.log(`\n[7] 测试删除文件...`)
    const deleteStartTime = Date.now()
    const deleteCommand = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: testKey
    })
    
    await s3Client.send(deleteCommand)
    const deleteTime = Date.now() - deleteStartTime
    console.log(`    ✅ 文件删除成功，耗时: ${deleteTime}ms`)
    
    // 计算总体性能
    const totalTime = listTime + putTime + getTime + deleteTime
    console.log(`\n[8] ✅ 所有测试通过! S3连接状态正常`)
    console.log(`    总操作耗时: ${totalTime}ms`)
    
    // 提供一些有用的信息
    console.log(`\n[9] 存储桶信息:`)
    console.log(`    存储桶名称: ${bucketName}`)
    console.log(`    区域: ${s3Config.region}`)
    
    if (s3Config.endpoint) {
      console.log(`    端点: ${s3Config.endpoint}`)
      // 对于七牛云等S3兼容服务，URL格式可能不同
      if (s3Config.forcePathStyle) {
        console.log(`    公共访问URL: ${s3Config.endpoint}/${bucketName}/`)
      } else {
        console.log(`    公共访问URL: ${s3Config.endpoint}/${bucketName}/`)
      }
    } else {
      console.log(`    公共访问URL: https://${bucketName}.s3.${s3Config.region}.amazonaws.com/`)
    }
    
  } catch (error) {
    console.log(`\n❌ 测试失败!`)
    console.log(`    错误类型: ${error.name}`)
    console.log(`    错误信息: ${error.message}`)
    
    if (error.name === 'NoSuchBucket') {
      console.log(`\n    存储桶不存在，可能的原因:`)
      console.log(`    - 存储桶名称错误`)
      console.log(`    - 存储桶尚未创建`)
      console.log(`    - 区域配置不正确`)
      console.log(`\n    解决方案:`)
      console.log(`    - 检查S3_BUCKET_NAME环境变量`)
      console.log(`    - 手动在AWS控制台创建存储桶`)
      console.log(`    - 检查S3_REGION环境变量`)
    } else if (error.name === 'InvalidAccessKeyId') {
      console.log(`\n    访问密钥无效，可能的原因:`)
      console.log(`    - S3_ACCESS_KEY_ID环境变量错误`)
      console.log(`    - 密钥已过期或被撤销`)
      console.log(`\n    解决方案:`)
      console.log(`    - 检查S3_ACCESS_KEY_ID环境变量`)
      console.log(`    - 重新生成AWS访问密钥`)
    } else if (error.name === 'SignatureDoesNotMatch') {
      console.log(`\n    签名不匹配，可能的原因:`)
      console.log(`    - S3_SECRET_ACCESS_KEY环境变量错误`)
      console.log(`    - 密钥与访问密钥ID不匹配`)
      console.log(`\n    解决方案:`)
      console.log(`    - 检查S3_SECRET_ACCESS_KEY环境变量`)
      console.log(`    - 确保密钥与访问密钥ID配对`)
    } else if (error.name === 'NetworkingError') {
      console.log(`\n    网络错误，可能的原因:`)
      console.log(`    - 网络连接问题`)
      console.log(`    - 防火墙阻止连接`)
      console.log(`    - 端点配置错误`)
      console.log(`\n    解决方案:`)
      console.log(`    - 检查网络连接`)
      console.log(`    - 检查防火墙设置`)
      console.log(`    - 检查S3_ENDPOINT环境变量`)
    } else if (error.name === 'AccessDenied') {
      console.log(`\n    访问被拒绝，可能的原因:`)
      console.log(`    - IAM权限不足`)
      console.log(`    - 存储桶策略限制`)
      console.log(`    - 区域限制`)
      console.log(`\n    解决方案:`)
      console.log(`    - 检查IAM用户权限`)
      console.log(`    - 检查存储桶策略`)
      console.log(`    - 确认区域配置正确`)
    }
    
    process.exit(1)
  }
}

// 执行测试
testS3Connection().then(() => {
  console.log('\n' + '='.repeat(50))
  console.log('测试完成')
  console.log('='.repeat(50))
  process.exit(0)
}).catch(error => {
  console.error('\n测试过程中发生未处理的错误:', error)
  process.exit(1)
})