import db from '../../utils/db.js'
import { verifyToken, extractToken } from '../../utils/jwt.js'
import { ObjectId } from 'mongodb'
import { deleteFileFromS3 } from '../../utils/s3.js'

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

    // 获取图片 ID
    const id = getRouterParam(event, 'id')
    if (!id) {
      throw createError({
        statusCode: 400,
        message: '缺少图片 ID'
      })
    }

    // 查找图片
    let objectId
    try {
      objectId = new ObjectId(id)
    } catch (err) {
      throw createError({
        statusCode: 400,
        message: '无效的图片 ID'
      })
    }

    const image = await db.images.findOne({ _id: objectId })
    if (!image) {
      throw createError({
        statusCode: 404,
        message: '图片不存在'
      })
    }

    // 软删除数据库记录
    await db.images.update(
      { _id: objectId },
      {
        $set: {
          isDeleted: true,
          deletedAt: new Date().toISOString(),
          deletedBy: user.username
        }
      }
    )

    // 从 S3 删除文件（异步执行，不阻塞响应）
    deleteFileFromS3(image.filename).catch(err => {
      console.error('[Images] 从 S3 删除文件失败:', err)
    })

    return {
      success: true,
      message: '删除成功'
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('[Images] 删除图片失败:', error)
    throw createError({
      statusCode: 500,
      message: '删除图片失败'
    })
  }
})
