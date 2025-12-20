import db from '../../utils/db.js'
import { verifyToken, extractToken, generateToken } from '../../utils/jwt.js'
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

    // 获取请求体
    const body = await readBody(event)
    const { username } = body

    if (!username || !username.trim()) {
      throw createError({
        statusCode: 400,
        message: '请输入新用户名'
      })
    }

    if (username.length < 3) {
      throw createError({
        statusCode: 400,
        message: '用户名长度至少 3 位'
      })
    }

    // 检查用户名是否已存在（如果不同）
    if (username !== user.username) {
      const existingUser = await db.users.findOne({ username: username.trim() })
      if (existingUser) {
        throw createError({
          statusCode: 400,
          message: '用户名已存在'
        })
      }
    }

    // 更新用户名
    let userObjectId
    try {
      userObjectId = new ObjectId(user.userId)
    } catch (err) {
      // 如果转换 ObjectId 失败，尝试使用字符串查询
      const result = await db.users.update(
        { _id: user.userId },
        {
          $set: {
            username: username.trim(),
            updatedAt: new Date().toISOString()
          }
        }
      )

      if (result.matchedCount === 0) {
        throw createError({
          statusCode: 404,
          message: '用户不存在'
        })
      }

      // 生成新 Token
      const newToken = await generateToken({
        userId: user.userId,
        username: username.trim()
      })

      return {
        success: true,
        message: '用户名修改成功',
        data: {
          token: newToken,
          username: username.trim()
        }
      }
    }

    await db.users.update(
      { _id: userObjectId },
      {
        $set: {
          username: username.trim(),
          updatedAt: new Date().toISOString()
        }
      }
    )

    // 生成新 Token
    const newToken = await generateToken({
      userId: user.userId,
      username: username.trim()
    })

    return {
      success: true,
      message: '用户名修改成功',
      data: {
        token: newToken,
        username: username.trim()
      }
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('[Admin] 修改用户名失败:', error)
    throw createError({
      statusCode: 500,
      message: '修改用户名失败'
    })
  }
})
