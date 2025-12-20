import db from '../../utils/db.js'
import { verifyToken, extractToken } from '../../utils/jwt.js'
import bcrypt from 'bcryptjs'
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
    const { oldPassword, newPassword } = body

    if (!oldPassword || !newPassword) {
      throw createError({
        statusCode: 400,
        message: '请输入旧密码和新密码'
      })
    }

    if (newPassword.length < 6) {
      throw createError({
        statusCode: 400,
        message: '新密码长度至少 6 位'
      })
    }

    // 获取用户
    const dbUser = await db.users.findOne({ _id: user.userId })
    if (!dbUser) {
      throw createError({
        statusCode: 404,
        message: '用户不存在'
      })
    }

    // 验证旧密码
    const isValidPassword = await bcrypt.compare(oldPassword, dbUser.password)
    if (!isValidPassword) {
      throw createError({
        statusCode: 400,
        message: '旧密码错误'
      })
    }

    // 加密新密码
    const hashedPassword = await bcrypt.hash(newPassword, 10)

    // 更新密码
    const result = await db.users.update(
      { _id: user.userId },
      {
        $set: {
          password: hashedPassword,
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

    return {
      success: true,
      message: '密码修改成功'
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('[Admin] 修改密码失败:', error)
    throw createError({
      statusCode: 500,
      message: '修改密码失败'
    })
  }
})
