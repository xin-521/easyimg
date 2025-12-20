#!/usr/bin/env node

/**
 * MongoDB连接状态测试脚本
 * 用于测试MongoDB连接是否正常工作
 */

import { MongoClient } from 'mongodb'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// 手动加载.env文件
function loadEnv() {
  try {
    const envPath = resolve(process.cwd(), '.env')
    const envContent = readFileSync(envPath, 'utf8')
    
    envContent.split('\n').forEach(line => {
      const trimmedLine = line.trim()
      if (trimmedLine && !trimmedLine.startsWith('#')) {
        const [key, ...values] = trimmedLine.split('=')
        if (key && values.length > 0) {
          process.env[key.trim()] = values.join('=').trim()
        }
      }
    })
    
    console.log('已加载.env文件')
  } catch (error) {
    console.log('未找到.env文件，使用默认环境变量')
  }
}

// 加载环境变量
loadEnv()

// MongoDB连接配置
const mongoUrl = process.env.MONGODB_URI || 'mongodb://localhost:27017/easyimg'
const dbName = process.env.MONGODB_DB_NAME || 'easyimg'

// 隐藏密码的函数
function hidePassword(uri) {
  if (!uri) return uri
  return uri.replace(/\/\/([^:]+):([^@]+)@/, '//***:***@')
}

console.log('='.repeat(50))
console.log('MongoDB 连接状态测试')
console.log('='.repeat(50))

async function testMongoConnection() {
  let client = null
  
  try {
    console.log(`\n[1] 尝试连接到 MongoDB...`)
    console.log(`    连接字符串: ${hidePassword(mongoUrl)}`)
    console.log(`    数据库名称: ${dbName}`)
    
    // 创建MongoDB客户端
    client = new MongoClient(mongoUrl, {
      serverSelectionTimeoutMS: 5000, // 5秒超时
      connectTimeoutMS: 5000,
    })
    
    // 连接到MongoDB
    const startTime = Date.now()
    await client.connect()
    const connectionTime = Date.now() - startTime
    
    console.log(`\n[2] ✅ 连接成功!`)
    console.log(`    连接耗时: ${connectionTime}ms`)
    
    // 获取数据库实例
    const db = client.db(dbName)
    
    // 测试基本操作
    console.log(`\n[3] 测试数据库操作...`)
    
    // 测试ping命令
    const pingResult = await db.admin().ping()
    console.log(`    Ping响应:`, pingResult)
    
    // 获取服务器信息
    const serverInfo = await db.admin().serverStatus()
    console.log(`    服务器版本: ${serverInfo.version}`)
    console.log(`    服务器名称: ${serverInfo.host}`)
    
    // 列出所有集合
    const collections = await db.listCollections().toArray()
    console.log(`    集合数量: ${collections.length}`)
    
    if (collections.length > 0) {
      console.log(`    集合列表:`)
      collections.forEach(collection => {
        console.log(`      - ${collection.name}`)
      })
    }
    
    // 测试读写操作
    console.log(`\n[4] 测试读写操作...`)
    
    // 创建测试集合
    const testCollection = db.collection('connection_test')
    
    // 插入测试文档
    const testDoc = {
      test: true,
      timestamp: new Date(),
      message: 'MongoDB连接测试'
    }
    
    const insertResult = await testCollection.insertOne(testDoc)
    console.log(`    ✅ 插入测试文档成功，ID: ${insertResult.insertedId}`)
    
    // 查询测试文档
    const foundDoc = await testCollection.findOne({ _id: insertResult.insertedId })
    console.log(`    ✅ 查询测试文档成功: ${foundDoc.message}`)
    
    // 删除测试文档
    const deleteResult = await testCollection.deleteOne({ _id: insertResult.insertedId })
    console.log(`    ✅ 删除测试文档成功，删除数量: ${deleteResult.deletedCount}`)
    
    console.log(`\n[5] ✅ 所有测试通过! MongoDB连接状态正常`)
    
  } catch (error) {
    console.log(`\n[2] ❌ 连接失败!`)
    console.log(`    错误类型: ${error.name}`)
    console.log(`    错误信息: ${error.message}`)
    
    if (error.name === 'MongoServerSelectionError') {
      console.log(`\n    可能的原因:`)
      console.log(`    - 网络连接问题`)
      console.log(`    - MongoDB服务未运行`)
      console.log(`    - 连接字符串配置错误`)
      console.log(`    - 防火墙阻止连接`)
    } else if (error.name === 'MongoNetworkError') {
      console.log(`\n    可能的原因:`)
      console.log(`    - 网络连接超时`)
      console.log(`    - MongoDB服务器地址不可达`)
    } else if (error.name === 'MongoServerError' && error.message.includes('authentication failed')) {
      console.log(`\n    认证失败，可能的原因:`)
      console.log(`    - 用户名或密码不正确`)
      console.log(`    - 数据库用户权限不足`)
      console.log(`    - 认证数据库不正确`)
      console.log(`    - 连接字符串中的认证信息有误`)
    } else if (error.name === 'MongoAuthError') {
      console.log(`\n    认证错误，可能的原因:`)
      console.log(`    - 认证凭据错误`)
      console.log(`    - 用户名或密码不正确`)
      console.log(`    - 用户权限不足`)
    }
    
    process.exit(1)
    
  } finally {
    if (client) {
      await client.close()
      console.log(`\n[6] 数据库连接已关闭`)
    }
  }
}

// 执行测试
testMongoConnection().then(() => {
  console.log('\n' + '='.repeat(50))
  console.log('测试完成')
  console.log('='.repeat(50))
  process.exit(0)
}).catch(error => {
  console.error('\n测试过程中发生未处理的错误:', error)
  process.exit(1)
})