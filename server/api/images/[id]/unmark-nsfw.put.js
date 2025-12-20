import db from '../../../utils/db.js'
import { authMiddleware } from '../../../utils/authMiddleware.js'
import { ObjectId } from 'mongodb'

export default defineEventHandler(async (event) => {
  // 验证登录
  await authMiddleware(event)

  try {
    // 获取图片 ID
    const id = getRouterParam(event, 'id')
    if (!id) {
      throw createError({
        statusCode: 400,
        message: '缺少图片 ID'
      })
    }

    // 将字符串 ID 转换为 ObjectId
    let objectId
    try {
      objectId = new ObjectId(id)
    } catch (err) {
      throw createError({
        statusCode: 400,
        message: '无效的图片 ID'
      })
    }

    // 查找图片
    const image = await db.images.findOne({ _id: objectId })
    if (!image) {
      throw createError({
        statusCode: 404,
        message: '图片不存在'
      })
    }

    // 检查是否是违规图片
    if (!image.isNsfw) {
      return {
        success: true,
        message: '该图片未被标记为违规'
      }
    }

    // 更新图片状态：取消违规标记，同时恢复图片（如果是因为违规被软删除的）
    const updateData = {
      isNsfw: false,
      moderationStatus: 'unmarked_by_admin',
      unmarkedAt: new Date().toISOString(),
      unmarkedBy: event.context.user.username
    }

    // 如果图片是因为违规被软删除的，同时恢复图片
    if (image.isDeleted) {
      updateData.isDeleted = false
      updateData.deletedAt = null
      updateData.deletedBy = null
    }

    await db.images.update(
      { _id: objectId },
      { $set: updateData }
    )

    return {
      success: true,
      message: image.isDeleted ? '已取消违规标记并恢复图片' : '已取消违规标记',
      data: {
        restored: image.isDeleted
      }
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('[Images] 取消违规标记失败:', error)
    throw createError({
      statusCode: 500,
      message: '取消违规标记失败'
    })
  }
})