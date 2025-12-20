import db from '../../utils/db.js'
import { authMiddleware } from '../../utils/authMiddleware.js'
import { deleteImage } from '../../utils/image.js'
import { ObjectId } from 'mongodb'

export default defineEventHandler(async (event) => {
  // 验证登录
  await authMiddleware(event)

  try {
    // 获取所有违规图片
    const nsfwImages = await db.images.find({ isNsfw: true })

    if (nsfwImages.length === 0) {
      return {
        success: true,
        message: '没有需要清空的违规图片',
        data: { deletedCount: 0 }
      }
    }

    let deletedCount = 0
    let errors = []

    for (const image of nsfwImages) {
      try {
        // 删除物理文件
        deleteImage(image.filename)

        // 从数据库删除记录
        await db.images.remove({ _id: new ObjectId(image._id) })
        deletedCount++
      } catch (err) {
        console.error(`删除违规图片失败 ${image.uuid}:`, err)
        errors.push(image.uuid)
      }
    }

    return {
      success: true,
      message: `成功清空 ${deletedCount} 张违规图片`,
      data: {
        deletedCount,
        errors: errors.length > 0 ? errors : undefined
      }
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('[Images] 清空违规图片失败:', error)
    throw createError({
      statusCode: 500,
      message: '清空违规图片失败'
    })
  }
})