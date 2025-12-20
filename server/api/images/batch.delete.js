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

    // 获取要删除的图片 ID 列表
    const body = await readBody(event)
    const { ids } = body

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      throw createError({
        statusCode: 400,
        message: '请选择要删除的图片'
      })
    }

    // 批量软删除
    let deletedCount = 0
    const filenamesToDelete = [] // 收集需要从 S3 删除的文件名
    
    for (const id of ids) {
      try {
        // 将字符串 ID 转换为 ObjectId
        const objectId = new ObjectId(id)
        
        // 先查找图片是否存在且未被删除
        const image = await db.images.findOne({ _id: objectId })
        if (image && !image.isDeleted) {
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
          // 收集文件名，用于后续从 S3 删除
          filenamesToDelete.push(image.filename)
          // 更新成功，增加计数
          deletedCount++
        }
      } catch (err) {
        // 忽略无效的 ID，继续处理下一个
        console.warn(`[Images] 无效的图片 ID: ${id}`)
      }
    }

    // 从 S3 批量删除文件（异步执行，不阻塞响应）
    if (filenamesToDelete.length > 0) {
      Promise.all(
        filenamesToDelete.map(filename => 
          deleteFileFromS3(filename).catch(err => 
            console.error(`[Images] 从 S3 删除文件 ${filename} 失败:`, err)
          )
        )
      ).catch(err => {
        console.error('[Images] 批量从 S3 删除文件失败:', err)
      })
    }

    return {
      success: true,
      message: `成功删除 ${deletedCount} 张图片`,
      data: {
        deletedCount
      }
    }
  } catch (error) {
    if (error.statusCode) {
      throw error
    }

    console.error('[Images] 批量删除图片失败:', error)
    throw createError({
      statusCode: 500,
      message: '批量删除图片失败'
    })
  }
})
