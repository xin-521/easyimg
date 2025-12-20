import { MongoClient, ObjectId } from 'mongodb'

// MongoDB 连接配置
const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/easyimg'
const dbName = process.env.MONGODB_DB_NAME || 'easyimg'

let client = null
let databaseInstance = null

// 连接到 MongoDB
async function connectToMongoDB() {
  if (client && client.topology && client.topology.isConnected()) {
    return databaseInstance
  }

  try {
    client = new MongoClient(mongoUrl)
    await client.connect()
    databaseInstance = client.db(dbName)
    console.log('[Database] 成功连接到 MongoDB:', mongoUrl)
    return databaseInstance
  } catch (error) {
    console.error('[Database] MongoDB 连接失败:', error)
    throw error
  }
}

// 获取数据库实例
async function getDB() {
  if (!databaseInstance) {
    await connectToMongoDB()
  }
  return databaseInstance
}

// 处理查询条件中的 _id
function processQuery(query) {
  if (query._id) {
    if (typeof query._id === 'string') {
      // 检查是否是有效的 ObjectId 格式 (24位十六进制字符串)
      if (/^[0-9a-fA-F]{24}$/.test(query._id)) {
        try {
          query._id = new ObjectId(query._id)
        } catch (e) {
          // 转换失败，保持字符串格式
        }
      }
      // 如果不是ObjectId格式，保持字符串格式（用于UUID等）
    }
  }
  return query
}

// 处理插入结果，添加 _id 字段
function processInsertResult(result) {
  if (result.insertedId) {
    return {
      ...result,
      _id: result.insertedId.toString()
    }
  }
  return result
}

// 创建集合操作对象
const createCollectionOperations = (collectionName) => ({
  findOne: async (query) => {
    const database = await getDB()
    query = processQuery(query)
    const result = await database.collection(collectionName).findOne(query)
    if (result && result._id) {
      result._id = result._id.toString()
    }
    return result
  },
  find: async (query) => {
    const database = await getDB()
    query = processQuery(query)
    const results = await database.collection(collectionName).find(query).toArray()
    return results.map(item => {
      if (item._id) {
        item._id = item._id.toString()
      }
      return item
    })
  },
  insert: async (doc) => {
    const database = await getDB()
    const result = await database.collection(collectionName).insertOne(doc)
    return processInsertResult(result)
  },
  update: async (query, update, options = {}) => {
    const database = await getDB()
    query = processQuery(query)
    
    // 处理 $set 操作中的 _id
    if (update.$set && update.$set._id) {
      delete update.$set._id
    }
    
    return await database.collection(collectionName).updateMany(query, update, options)
  },
  remove: async (query, options = {}) => {
    const database = await getDB()
    query = processQuery(query)
    return await database.collection(collectionName).deleteMany(query, options)
  },
  count: async (query) => {
    const database = await getDB()
    query = processQuery(query)
    return await database.collection(collectionName).countDocuments(query)
  },
  ensureIndex: async (indexSpec) => {
    const database = await getDB()
    return await database.collection(collectionName).createIndex(indexSpec)
  }
})

// 导出数据库操作对象
export const db = {
  users: createCollectionOperations('users'),
  images: createCollectionOperations('images'),
  apikeys: createCollectionOperations('apikeys'),
  settings: createCollectionOperations('settings'),
  moderationTasks: createCollectionOperations('moderation_tasks'),
  ipBlacklist: createCollectionOperations('ip_blacklist')
}

// 初始化数据库连接
connectToMongoDB().catch(error => {
  console.error('[Database] 初始化 MongoDB 连接失败:', error)
})

export default db
