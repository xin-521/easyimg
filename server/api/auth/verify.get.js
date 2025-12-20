import { verifyToken, extractToken } from '../../utils/jwt.js'
import db from '../../utils/db.js'
import { ObjectId } from 'mongodb'

export default defineEventHandler(async (event) => {
  try {
    const token = extractToken(event)

    if (!token) {
      return {
        success: false,
        authenticated: false,
        message: '未提供 Token'
      }
    }

    const decoded = await verifyToken(token)
    if (!decoded) {
      return {
        success: false,
        authenticated: false,
        message: 'Token 无效或已过期'
      }
    }

    // 验证用户是否存在
    let user
    try {
      // 尝试使用 ObjectId 查询
      const objectId = new ObjectId(decoded.userId)
      user = await db.users.findOne({ _id: objectId })
    } catch (err) {
      // 如果转换 ObjectId 失败，尝试使用字符串查询
      user = await db.users.findOne({ _id: decoded.userId })
    }

    if (!user) {
      return {
        success: false,
        authenticated: false,
        message: '用户不存在'
      }
    }

    return {
      success: true,
      authenticated: true,
      data: {
        user: {
          username: user.username
        }
      }
    }
  } catch (error) {
    return {
      success: false,
      authenticated: false,
      message: '验证失败: ' + error.message
    }
  }
})
