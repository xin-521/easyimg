import db from '../../utils/db.js'
import { verifyToken, extractToken } from '../../utils/jwt.js'
import { deleteImage } from '../../utils/image.js'
import { deleteFileFromS3 } from '../../utils/s3.js'
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

    // 获取所有已软删除的图片
    const deletedImages = await db.images.find({ isDeleted: true })

    if (deletedImages.length === 0) {
      return {
        success: true,
        message: '没有需要硬删除的图片',
        data: { deletedCount: 0 }
      }
    }

    let deletedCount = 0
    let errors = []

    for (const image of deletedImages) {
      try {
        // 从 S3 删除文件
        await deleteFileFromS3(image.filename)

        // 从数据库删除记录
        await db.images.remove({ _id: new ObjectId(image._id) })
        deletedCount++
      } catch (err) {
        console.error(`删除图片失败 ${image.uuid}:`, err)
        errors.push(image.uuid)
      }
    }

    return {
      success: true,
      message: `成功硬删除 ${deletedCount} 张图片`,
      data: {
        deletedCount,
        errors: errors.length > 0 ? errors : undefined
      }
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('[Settings] 硬删除图片失败:', error)
    throw createError({
      statusCode: 500,
      message: '硬删除图片失败'
    })
  }
})
