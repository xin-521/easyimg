import db from './db.js'
import { moderateImage } from './moderation.js'
import { ObjectId } from 'mongodb'
import { addToBlacklist } from './ipBlacklist.js'
import { sendNsfwNotification } from './notification.js'

/**
 * 内容审核任务队列处理器
 *
 * 任务状态:
 * - pending: 等待处理
 * - processing: 处理中
 * - completed: 完成
 * - failed: 失败（可重试）
 * - error: 错误（不可重试）
 */

// 队列处理器状态
let isProcessing = false
let processorInterval = null
let currentTaskRetryCount = 0
const MAX_RETRY_COUNT = 3  // 单个任务最大重试次数
const RETRY_INTERVAL = 60 * 1000  // 重试间隔 1 分钟
const PROCESS_INTERVAL = 5 * 1000  // 正常处理间隔 5 秒

/**
 * 创建审核任务
 * @param {string} imageId - 图片ID
 * @param {string} imageUuid - 图片UUID
 * @param {string} filename - 文件名
 * @returns {Promise<object>} - 创建的任务
 */
export async function createModerationTask(imageId, imageUuid, filename) {
  const task = {
    _id: new ObjectId(),
    imageId: imageId,
    imageUuid: imageUuid,
    filename: filename,
    status: 'pending',
    retryCount: 0,
    result: null,
    error: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }

  await db.moderationTasks.insert(task)
  console.log(`[ModerationQueue] 创建审核任务: ${task._id} (图片: ${imageUuid})`)

  // 确保处理器正在运行
  startProcessor()

  return task
}

/**
 * 获取下一个待处理的任务
 */
async function getNextPendingTask() {
  const tasks = await db.moderationTasks.find({
    status: { $in: ['pending', 'failed'] }
  })

  // 按创建时间排序，优先处理较早的任务
  tasks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))

  // 对于 failed 状态的任务，检查重试次数
  for (const task of tasks) {
    if (task.status === 'failed' && task.retryCount >= MAX_RETRY_COUNT) {
      // 超过最大重试次数，标记为 error
      await db.moderationTasks.update(
        { _id: new ObjectId(task._id) },
        {
          $set: {
            status: 'error',
            error: '超过最大重试次数',
            updatedAt: new Date().toISOString()
          }
        }
      )
      continue
    }
    return task
  }

  return null
}

/**
 * 处理单个任务
 */
async function processTask(task) {
  console.log(`[ModerationQueue] 开始处理任务: ${task._id} (图片: ${task.imageUuid})`)

  // 更新任务状态为处理中
  await db.moderationTasks.update(
    { _id: new ObjectId(task._id) },
    {
      $set: {
        status: 'processing',
        updatedAt: new Date().toISOString()
      }
    }
  )

  try {
    // 获取内容安全配置
    const configDoc = await db.settings.findOne({ key: 'publicApiConfig' })
    const contentSafetyConfig = configDoc?.value?.contentSafety

    if (!contentSafetyConfig?.enabled) {
      // 内容安全未启用，跳过
      await db.moderationTasks.update(
        { _id: task._id },
        {
          $set: {
            status: 'completed',
            result: { skipped: true, reason: '内容安全检测未启用' },
            updatedAt: new Date().toISOString()
          }
        }
      )
      console.log(`[ModerationQueue] 任务跳过（未启用）: ${task._id}`)
      return { success: true, retry: false }
    }

    // 执行审核
    const result = await moderateImage(task.imageId, task.filename, contentSafetyConfig)

    if (result.success) {
      // 审核成功
      await db.moderationTasks.update(
        { _id: new ObjectId(task._id) },
        {
          $set: {
            status: 'completed',
            result: result,
            updatedAt: new Date().toISOString()
          }
        }
      )

      // 更新图片审核状态
      await db.images.update(
        { _id: new ObjectId(task.imageId) },
        {
          $set: {
            moderationStatus: 'completed',
            moderationResult: result,
            moderationChecked: true,  // 标记为已检测
            isNsfw: result.isNsfw || false,
            updatedAt: new Date().toISOString()
          }
        }
      )

      // 如果检测到违规，只记录日志（不再自动软删除）
      if (result.isNsfw) {
        console.warn(`[ModerationQueue] 检测到违规内容: 图片 ${task.imageUuid} (score: ${result.score})`)

        // 如果开启了自动拉黑 IP，将上传者 IP 加入黑名单
        if (contentSafetyConfig.autoBlacklistIp) {
          // 获取图片的上传者 IP
          const image = await db.images.findOne({ _id: new ObjectId(task.imageId) })
          if (image?.ip && image.ip !== 'unknown') {
            try {
              await addToBlacklist(image.ip, `自动拉黑：上传违规图片 ${task.imageUuid}`)
              console.warn(`[ModerationQueue] 已将 IP ${image.ip} 加入黑名单`)
            } catch (err) {
              console.error(`[ModerationQueue] 添加 IP 到黑名单失败:`, err)
            }
          }
        }
      }

      // 获取站点 URL 配置，用于生成完整图片链接
      const appSettingsDoc = await db.settings.findOne({ key: 'appSettings' })
      let siteUrl = appSettingsDoc?.value?.siteUrl || ''

      // 移除末尾斜杠，确保 URL 拼接正确
      siteUrl = siteUrl.replace(/\/+$/, '')
      const imageExtension = task.filename.split('.').pop()
      const fullImageUrl = siteUrl ? `${siteUrl}/i/${task.imageUuid}.${imageExtension}` : ''

      // 发送鉴黄检测结果通知（异步，不阻塞处理）
      sendNsfwNotification(
        {
          id: task.imageId,
          filename: task.filename,
          url: fullImageUrl
        },
        {
          isNsfw: result.isNsfw,
          score: result.score,
          provider: result.provider
        }
      ).catch(err => {
        console.error('[ModerationQueue] 发送鉴黄通知失败:', err)
      })

      console.log(`[ModerationQueue] 任务完成: ${task._id} (isNsfw: ${result.isNsfw}, score: ${result.score})`)
      return { success: true, retry: false }
    } else {
      // 审核失败，需要重试
      const newRetryCount = (task.retryCount || 0) + 1
      await db.moderationTasks.update(
        { _id: new ObjectId(task._id) },
        {
          $set: {
            status: 'failed',
            retryCount: newRetryCount,
            error: result.error,
            updatedAt: new Date().toISOString()
          }
        }
      )

      // 更新图片审核状态
      await db.images.update(
        { _id: new ObjectId(task.imageId) },
        {
          $set: {
            moderationStatus: 'failed',
            moderationError: result.error,
            updatedAt: new Date().toISOString()
          }
        }
      )

      console.log(`[ModerationQueue] 任务失败: ${task._id} (error: ${result.error}, retry: ${newRetryCount}/${MAX_RETRY_COUNT})`)

      // 如果是服务不可用，返回需要重试
      return { success: false, retry: true, error: result.error }
    }
  } catch (error) {
    // 处理异常
    const newRetryCount = (task.retryCount || 0) + 1
    await db.moderationTasks.update(
      { _id: new ObjectId(task._id) },
      {
        $set: {
          status: 'failed',
          retryCount: newRetryCount,
          error: error.message,
          updatedAt: new Date().toISOString()
        }
      }
    )

    console.error(`[ModerationQueue] 任务异常: ${task._id}`, error)
    return { success: false, retry: true, error: error.message }
  }
}

/**
 * 队列处理循环
 */
async function processQueue() {
  if (isProcessing) {
    return
  }

  isProcessing = true

  try {
    const task = await getNextPendingTask()

    if (!task) {
      // 没有待处理的任务
      isProcessing = false
      return
    }

    const result = await processTask(task)

    if (!result.success && result.retry) {
      // 需要重试，等待重试间隔后再处理
      console.log(`[ModerationQueue] 服务不可用，${RETRY_INTERVAL / 1000}秒后重试...`)
      currentTaskRetryCount++

      // 暂停处理，等待重试间隔
      if (processorInterval) {
        clearInterval(processorInterval)
        processorInterval = null  // 必须设置为 null，否则 startProcessor() 会直接返回
      }

      // 先将 isProcessing 设为 false，以便重试时能正常处理
      isProcessing = false

      setTimeout(() => {
        console.log(`[ModerationQueue] 开始重试...`)
        startProcessor()
      }, RETRY_INTERVAL)

      return
    }

    // 成功或不需要重试，重置重试计数
    currentTaskRetryCount = 0
  } catch (error) {
    console.error('[ModerationQueue] 队列处理错误:', error)
  }

  isProcessing = false
}

/**
 * 启动处理器
 */
export function startProcessor() {
  if (processorInterval) {
    return
  }

  console.log('[ModerationQueue] 启动审核任务处理器')

  // 立即执行一次
  processQueue()

  // 定时执行
  processorInterval = setInterval(() => {
    processQueue()
  }, PROCESS_INTERVAL)
}

/**
 * 停止处理器
 */
export function stopProcessor() {
  if (processorInterval) {
    clearInterval(processorInterval)
    processorInterval = null
    console.log('[ModerationQueue] 停止审核任务处理器')
  }
}

/**
 * 获取队列状态
 */
export async function getQueueStatus() {
  const [pending, processing, completed, failed, error] = await Promise.all([
    db.moderationTasks.count({ status: 'pending' }),
    db.moderationTasks.count({ status: 'processing' }),
    db.moderationTasks.count({ status: 'completed' }),
    db.moderationTasks.count({ status: 'failed' }),
    db.moderationTasks.count({ status: 'error' })
  ])

  return {
    pending,
    processing,
    completed,
    failed,
    error,
    total: pending + processing + completed + failed + error,
    isProcessing
  }
}

/**
 * 重试失败的任务
 */
export async function retryFailedTasks() {
  const result = await db.moderationTasks.update(
    { status: { $in: ['failed', 'error'] } },
    {
      $set: {
        status: 'pending',
        retryCount: 0,
        error: null,
        updatedAt: new Date().toISOString()
      }
    },
    { multi: true }
  )

  console.log(`[ModerationQueue] 重置 ${result} 个失败任务`)

  // 确保处理器正在运行
  startProcessor()

  return { success: true, count: result }
}

export default {
  createModerationTask,
  startProcessor,
  stopProcessor,
  getQueueStatus,
  retryFailedTasks
}