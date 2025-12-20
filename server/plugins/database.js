import db from '../utils/db.js'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import { getDefaultContentSafetyConfig } from '../utils/moderation.js'

// 初始化默认管理员用户
async function initDefaultUser() {
  const existingUser = await db.users.findOne({ username: 'easyimg' })
  if (!existingUser) {
    const hashedPassword = await bcrypt.hash('easyimg', 10)
    await db.users.insert({
      _id: uuidv4(),
      username: 'easyimg',
      password: hashedPassword,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    console.log('[Database] 默认管理员用户已创建 (用户名: easyimg, 密码: easyimg)')
  }
}

// 初始化 JWT 密钥
async function initJwtSecret() {
  let jwtSetting = await db.settings.findOne({ key: 'jwtSecret' })
  if (!jwtSetting) {
    const secret = crypto.randomBytes(64).toString('hex')
    await db.settings.insert({
      _id: uuidv4(),
      key: 'jwtSecret',
      value: secret,
      createdAt: new Date().toISOString()
    })
    console.log('[Database] JWT 密钥已生成')
  }
}

// 初始化默认 ApiKey
async function initDefaultApiKey() {
  const existingKey = await db.apikeys.findOne({ isDefault: true })
  if (!existingKey) {
    const apiKey = `sk-${uuidv4().replace(/-/g, '')}`
    await db.apikeys.insert({
      _id: uuidv4(),
      key: apiKey,
      name: '默认密钥',
      isDefault: true,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    console.log('[Database] 默认 ApiKey 已创建')
  }
}

// 初始化公共 API 配置
async function initPublicApiConfig() {
  const existingConfig = await db.settings.findOne({ key: 'publicApiConfig' })
  if (!existingConfig) {
    await db.settings.insert({
      _id: uuidv4(),
      key: 'publicApiConfig',
      value: {
        enabled: false,                         // 是否启用公共 API（默认关闭）
        allowedFormats: ['jpg', 'jpeg', 'png', 'gif', 'webp'],  // 允许的图片格式
        maxFileSize: 10 * 1024 * 1024,          // 最大文件大小 10MB
        compressToWebp: true,                   // 是否压缩转换为 WebP
        webpQuality: 80,                        // WebP 压缩质量 (100 - 20% = 80)
        rateLimit: 10,                          // 每分钟请求限制
        allowConcurrent: false,                 // 是否允许并发上传
        // 内容安全配置（从 moderation.js 获取默认配置）
        contentSafety: getDefaultContentSafetyConfig()
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    console.log('[Database] 公共 API 配置已初始化')
  }
}

// 初始化私有 API 配置
async function initPrivateApiConfig() {
  const existingConfig = await db.settings.findOne({ key: 'privateApiConfig' })
  if (!existingConfig) {
    await db.settings.insert({
      _id: uuidv4(),
      key: 'privateApiConfig',
      value: {
        maxFileSize: 100 * 1024 * 1024,         // 最大文件大小 100MB
        convertToWebp: false,                   // 是否转换为 WebP
        rateLimit: 100,                         // 每分钟请求限制
        maxConcurrent: 5                        // 最大并发数
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    console.log('[Database] 私有 API 配置已初始化')
  }
}

// 初始化应用设置
async function initAppSettings() {
  const existingSettings = await db.settings.findOne({ key: 'appSettings' })
  if (!existingSettings) {
    await db.settings.insert({
      _id: uuidv4(),
      key: 'appSettings',
      value: {
        appName: 'EasyImg',                     // 应用名称
        appLogo: ''                             // 应用 Logo URL
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    console.log('[Database] 应用设置已初始化')
  }
}

// 创建数据库索引
async function createIndexes() {
  // 用户表索引
  await db.users.ensureIndex({ username: 1 }, { unique: true })

  // 图片表索引
  await db.images.ensureIndex({ uuid: 1 }, { unique: true })
  await db.images.ensureIndex({ uploadedAt: 1 })
  await db.images.ensureIndex({ isDeleted: 1 })
  await db.images.ensureIndex({ uploadedBy: 1 })
  await db.images.ensureIndex({ moderationStatus: 1 })  // 审核状态索引
  await db.images.ensureIndex({ isNsfw: 1 })            // 违规标记索引

  // ApiKey 表索引
  await db.apikeys.ensureIndex({ key: 1 }, { unique: true })

  // 设置表索引
  await db.settings.ensureIndex({ key: 1 }, { unique: true })

  // 审核任务表索引
  await db.moderationTasks.ensureIndex({ imageId: 1 })
  await db.moderationTasks.ensureIndex({ status: 1 })
  await db.moderationTasks.ensureIndex({ createdAt: 1 })

  // IP 黑名单表索引
  await db.ipBlacklist.ensureIndex({ ip: 1 }, { unique: true })
  await db.ipBlacklist.ensureIndex({ createdAt: 1 })

  console.log('[Database] 数据库索引已创建')
}

// 数据库初始化
export async function initDatabase() {
  try {
    await createIndexes()
    await initDefaultUser()
    await initJwtSecret()
    await initDefaultApiKey()
    await initPublicApiConfig()
    await initPrivateApiConfig()
    await initAppSettings()
    console.log('[Database] 数据库初始化完成')
  } catch (error) {
    console.error('[Database] 数据库初始化失败:', error)
    throw error
  }
}

export default defineNitroPlugin(async () => {
  await initDatabase()
})
