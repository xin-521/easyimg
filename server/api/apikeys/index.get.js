import db from '../../utils/db.js'
import { verifyToken, extractToken } from '../../utils/jwt.js'

export default defineEventHandler(async (event) => {
  try {
    // 验证登录
    const token = extractToken(event)
    if (!token) {
      throw createError({
        statusCode: 401,
        message: '请先登录'
      })
    }

    const user = await verifyToken(token)
    if (!user) {
      throw createError({
        statusCode: 401,
        message: 'Token 无效或已过期'
      })
    }

    // 获取所有 ApiKey
    const apiKeys = await db.apikeys.find({})

    // 按创建时间排序
    apiKeys.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

    // 返回 ApiKey 列表
    const safeKeys = apiKeys.map(key => ({
      id: key._id.toString(),
      key: key.key,
      name: key.name,
      isDefault: key.isDefault || false,
      enabled: key.enabled !== false,
      createdAt: key.createdAt,
      updatedAt: key.updatedAt
    }))

    return {
      success: true,
      data: safeKeys
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('[ApiKeys] 获取 ApiKey 列表失败:', error)
    throw createError({
      statusCode: 500,
      message: '获取 ApiKey 列表失败'
    })
  }
})
