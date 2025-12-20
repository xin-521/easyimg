import db from '../../utils/db.js'
import { verifyToken, extractToken } from '../../utils/jwt.js'
import { v4 as uuidv4 } from 'uuid'
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

    // 获取请求体
    const body = await readBody(event)
    const { name, enabled, regenerate } = body

    // 构建更新对象
    const updateData = {
      updatedAt: new Date().toISOString()
    }

    if (name !== undefined) {
      updateData.name = name.trim()
    }

    if (enabled !== undefined) {
      updateData.enabled = enabled
    }

    // 如果需要重新生成 Key
    if (regenerate) {
      updateData.key = `sk-${uuidv4().replace(/-/g, '')}`
    }

    // 更新
    await db.apikeys.update({ _id: objectId }, { $set: updateData })

    // 获取更新后的数据
    const updatedKey = await db.apikeys.findOne({ _id: objectId })

    return {
      success: true,
      message: 'ApiKey 更新成功',
      data: {
        id: updatedKey._id.toString(),
        key: updatedKey.key,
        name: updatedKey.name,
        isDefault: updatedKey.isDefault,
        enabled: updatedKey.enabled,
        createdAt: updatedKey.createdAt,
        updatedAt: updatedKey.updatedAt
      }
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('[ApiKeys] 更新 ApiKey 失败:', error)
    throw createError({
      statusCode: 500,
      message: '更新 ApiKey 失败'
    })
  }
})
