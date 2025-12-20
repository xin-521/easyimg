import db from '../../utils/db.js'
import { verifyToken, extractToken } from '../../utils/jwt.js'
import { v4 as uuidv4 } from 'uuid'

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

    // 获取请求体
    const body = await readBody(event)
    const { name } = body

    if (!name || !name.trim()) {
      throw createError({
        statusCode: 400,
        message: '请输入 ApiKey 名称'
      })
    }

    // 生成新的 ApiKey
    const apiKey = `sk-${uuidv4().replace(/-/g, '')}`

    const newKey = {
      key: apiKey,
      name: name.trim(),
      isDefault: false,
      enabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const insertResult = await db.apikeys.insert(newKey)
    const keyId = insertResult._id

    return {
      success: true,
      message: 'ApiKey 创建成功',
      data: {
        id: keyId.toString(),
        key: newKey.key,
        name: newKey.name,
        isDefault: newKey.isDefault,
        enabled: newKey.enabled,
        createdAt: newKey.createdAt
      }
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('[ApiKeys] 创建 ApiKey 失败:', error)
    throw createError({
      statusCode: 500,
      message: '创建 ApiKey 失败'
    })
  }
})
