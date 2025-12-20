import db from '../utils/db.js'
import { startProcessor as startModerationProcessor, retryFailedTasks } from '../utils/moderationQueue.js'
import { deleteImage } from '../utils/image.js'

// 定时任务间隔（毫秒）
const RETRY_FAILED_TASKS_INTERVAL = 60 * 60 * 1000  // 1 小时

// 硬删除已软删除的图片文件
export async function hardDeleteImages() {
  try {
    const deletedImages = await db.images.find({ isDeleted: true })

    if (deletedImages.length === 0) {
      return { success: true, count: 0, message: '没有需要硬删除的图片' }
    }

    let deletedCount = 0
    for (const image of deletedImages) {
      try {
        // 删除S3中的文件
        await deleteImage(image.filename)

        // 从数据库中彻底删除记录
        await db.images.remove({ _id: image._id })
        deletedCount++
      } catch (err) {
        console.error(`[Scheduler] 硬删除图片失败 ${image.uuid}:`, err)
      }
    }

    console.log(`[Scheduler] 已硬删除 ${deletedCount} 张图片`)
    return { success: true, count: deletedCount, message: `已硬删除 ${deletedCount} 张图片` }
  } catch (error) {
    console.error('[Scheduler] 硬删除图片时出错:', error)
    return { success: false, count: 0, message: error.message }
  }
}

// 重试失败的审核任务
async function retryFailedModerationTasks() {
  try {
    // 获取 error 状态的任务数量
    const errorCount = await db.moderationTasks.count({ status: 'error' })

    if (errorCount === 0) {
      console.log('[Scheduler] 没有需要重试的失败审核任务')
      return
    }

    console.log(`[Scheduler] 发现 ${errorCount} 个失败的审核任务，开始重试...`)
    const result = await retryFailedTasks()
    console.log(`[Scheduler] 已重置 ${result.count} 个失败的审核任务`)
  } catch (error) {
    console.error('[Scheduler] 重试失败审核任务时出错:', error)
  }
}

export default defineNitroPlugin(() => {
  // 启动内容审核任务处理器
  startModerationProcessor()
  console.log('[Scheduler] 内容审核任务处理器已启动')

  // 启动定时任务：每小时重试失败的审核任务
  setInterval(() => {
    retryFailedModerationTasks()
  }, RETRY_FAILED_TASKS_INTERVAL)
  console.log('[Scheduler] 失败审核任务重试定时器已启动（每小时执行一次）')
})
