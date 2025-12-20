import db from '../../utils/db.js'
import { verifyToken, extractToken } from '../../utils/jwt.js'
import { ObjectId } from 'mongodb'

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

    // 获取 ApiKey ID
    const id = getRouterParam(event, 'id')
    if (!id) {
      throw createError({
        statusCode: 400,
        message: '缺少 ApiKey ID'
      })
    }

    // 将字符串 ID 转换为 ObjectId
    let objectId
    try {
      objectId = new ObjectId(id)
    } catch (err) {
      throw createError({
        statusCode: 400,
        message: '无效的 ApiKey ID'
      })
    }

    // 查找 ApiKey
    const apiKey = await db.apikeys.findOne({ _id: objectId })
    if (!apiKey) {
      throw createError({
        statusCode: 404,
        message: 'ApiKey 不存在'
      })
    }

    // 检查是否为默认 Key（不能删除）
    if (apiKey.isDefault) {
      throw createError({
        statusCode: 400,
        message: '默认 ApiKey 不能删除，只能更新'
      })
    }

    // 删除 ApiKey
    await db.apikeys.remove({ _id: objectId })

    return {
      success: true,
      message: 'ApiKey 删除成功'
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('[ApiKeys] 删除 ApiKey 失败:', error)
    throw createError({
      statusCode: 500,
      message: '删除 ApiKey 失败'
    })
  }
})
