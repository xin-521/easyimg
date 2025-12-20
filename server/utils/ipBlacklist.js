import db from './db.js'
import { ObjectId } from 'mongodb'

/**
 * IP 黑名单管理工具
 */

/**
 * 检查 IP 是否在黑名单中
 * @param {string} ip - IP 地址
 * @returns {Promise<boolean>}
 */
export async function isBlacklisted(ip) {
  if (!ip || ip === 'unknown') {
    return false
  }
  const record = await db.ipBlacklist.findOne({ ip })
  return !!record
}

/**
 * 将 IP 添加到黑名单
 * @param {string} ip - IP 地址
 * @param {string} reason - 拉黑原因
 * @returns {Promise<object>}
 */
export async function addToBlacklist(ip, reason = '') {
  if (!ip || ip === 'unknown') {
    return { success: false, error: '无效的 IP 地址' }
  }

  // 检查是否已在黑名单中
  const existing = await db.ipBlacklist.findOne({ ip })
  if (existing) {
    return { success: false, error: 'IP 已在黑名单中', existing: true }
  }

  const record = {
    _id: new ObjectId(),
    ip: ip,
    reason: reason,
    createdAt: new Date().toISOString()
  }

  await db.ipBlacklist.insert(record)
  console.log(`[IPBlacklist] IP ${ip} 已加入黑名单: ${reason}`)

  return { success: true, record }
}

/**
 * 从黑名单中移除 IP
 * @param {string} ip - IP 地址
 * @returns {Promise<object>}
 */
export async function removeFromBlacklist(ip) {
  if (!ip) {
    return { success: false, error: '无效的 IP 地址' }
  }

  const numRemoved = await db.ipBlacklist.remove({ ip })
  if (numRemoved > 0) {
    console.log(`[IPBlacklist] IP ${ip} 已从黑名单中移除`)
    return { success: true }
  }

  return { success: false, error: 'IP 不在黑名单中' }
}

/**
 * 通过 ID 从黑名单中移除
 * @param {string} id - 记录 ID
 * @returns {Promise<object>}
 */
export async function removeFromBlacklistById(id) {
  if (!id) {
    return { success: false, error: '无效的 ID' }
  }

  try {
    const objectId = new ObjectId(id)
    const record = await db.ipBlacklist.findOne({ _id: objectId })
    if (!record) {
      return { success: false, error: '记录不存在' }
    }

    await db.ipBlacklist.remove({ _id: objectId })
    console.log(`[IPBlacklist] IP ${record.ip} 已从黑名单中移除`)

    return { success: true, ip: record.ip }
  } catch (error) {
    return { success: false, error: '无效的 ID 格式' }
  }
}

/**
 * 获取黑名单列表
 * @param {object} options - 选项 { page, limit }
 * @returns {Promise<object>}
 */
export async function getBlacklist(options = {}) {
  const page = options.page || 1
  const limit = options.limit || 20
  const skip = (page - 1) * limit

  const total = await db.ipBlacklist.count({})
  let records = await db.ipBlacklist.find({})

  // 按创建时间倒序排序
  records.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

  // 分页
  records = records.slice(skip, skip + limit)

  return {
    records,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit)
    }
  }
}

/**
 * 获取黑名单数量
 * @returns {Promise<number>}
 */
export async function getBlacklistCount() {
  return await db.ipBlacklist.count({})
}

export default {
  isBlacklisted,
  addToBlacklist,
  removeFromBlacklist,
  removeFromBlacklistById,
  getBlacklist,
  getBlacklistCount
}