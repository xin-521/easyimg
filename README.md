<div align="center">

# EasyImg

_✨ 简单易用的个人图床系统，基于 Nuxt.js 构建 ✨_


## 功能特性

### 🖼️ 图片管理
- **多种上传方式**：支持点击、拖拽、粘贴上传，支持多图批量上传
- **URL 上传**：支持从 URL 直接下载图片到本地图库
- **瀑布流展示**：响应式瀑布流布局，自适应不同屏幕尺寸
- **图片预览**：支持大图预览，显示图片详细信息
- **批量操作**：支持批量选择、批量删除图片
- **回收站**：软删除机制，支持清空回收站释放空间

### 🔐 权限控制
- **公共/私有上传**：支持访客上传和登录后私有上传两种模式
- **API Key 管理**：支持创建多个 API Key，方便第三方工具调用
- **IP 黑名单**：支持手动或自动拉黑恶意 IP

### 🛡️ 内容安全
- **NSFW 检测**：支持多种鉴黄服务（nsfwdet.com、elysiatools.com、自建 nsfw_detector）
- **自动处理**：违规图片自动软删除，可选自动拉黑上传者 IP
- **违规管理**：支持查看违规图片列表，可手动取消违规标记

### 📊 数据统计
- **存储统计**：实时统计活跃图片数、存储空间占用
- **分类统计**：区分公共上传和私有上传数量
- **内容安全统计**：检测图片总数、违规图片数、违规率

### 🔔 通知推送
- **多种通知方式**：支持 Webhook、Telegram、Email、Server酱
- **事件通知**：登录通知、图片上传通知、鉴黄检测结果通知
- **自定义模板**：Webhook 支持自定义请求体模板

### ⚙️ 系统设置
- **应用配置**：自定义应用名称、Logo、全局背景图片
- **公告系统**：支持弹窗和横幅两种公告展示形式
- **上传配置**：可配置允许的格式、文件大小限制、WebP 压缩等
- **频率限制**：支持配置同一 IP 的请求频率限制

### 🎨 界面特性
- **深色模式**：支持亮色/深色主题切换
- **响应式设计**：完美适配桌面端和移动端
- **毛玻璃效果**：支持背景图片毛玻璃模糊效果

## 快速开始

### 前置要求

- Node.js 18.0 或更高版本
- MongoDB 4.4 或更高版本
- pnpm 包管理器

### 手动部署

```bash
# 1. 克隆项目
git clone https://github.com/chaos-zhu/easyimg.git
cd easyimg

# 2. 安装依赖
pnpm install

# 3. 配置环境变量
cp .env.example .env
# 编辑 .env 文件，设置 MongoDB 连接字符串和 S3 配置（可选）

# 4. 开发模式运行
pnpm dev

# 5. 构建生产版本
pnpm build

# 6. 启动生产服务
node .output/server/index.mjs
```

### 默认账户

首次启动后，使用以下默认账户登录：

- **用户名**：`easyimg`
- **密码**：`easyimg`

> ⚠️ 请登录后立即修改默认用户名密码！

<!-- ## 配置说明

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `PORT` | 服务端口 | `3000` |
| `HOST` | 监听地址 | `0.0.0.0` |
| `NODE_ENV` | 运行环境 | `production` | -->

### 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `MONGODB_URI` | MongoDB 连接字符串 | `mongodb://localhost:27017/easyimg` |
| `NODE_ENV` | 运行环境 | `production` |
| `PORT` | 服务端口 | `3000` |
| `HOST` | 监听地址 | `0.0.0.0` |

### S3 存储配置（可选）

如需使用 S3 兼容存储服务（如七牛云、阿里云OSS、AWS S3等），请配置以下环境变量：

| 变量名 | 说明 | 必需 |
|--------|------|------|
| `S3_REGION` | S3 存储区域 | 是 |
| `S3_ACCESS_KEY_ID` | S3 访问密钥ID | 是 |
| `S3_SECRET_ACCESS_KEY` | S3 访问密钥 | 是 |
| `S3_BUCKET_NAME` | S3 存储桶名称 | 是 |
| `S3_ENDPOINT` | S3 服务端点（可选） | 否 |
| `S3_FORCE_PATH_STYLE` | 强制使用路径样式（可选） | 否 |
| `S3_BASE_URL` | CDN或自定义域名前缀（可选） | 否 |

### 数据持久化

- **MongoDB** - 存储应用数据、用户信息、图片元数据等
- **S3存储** - 存储图片文件（如果配置了S3）
- **本地存储** - 未配置S3时，图片存储在 `uploads/` 目录

> 📝 建议使用 MongoDB Atlas 云数据库和 S3 存储服务以获得更好的稳定性和性能。

## API 文档

### 基础信息

- **Base URL**: `https://your-domain.com/api`
- **认证方式**: JWT Token 或 API Key
- **Content-Type**: `application/json`

### 认证接口

#### 用户登录
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "your-username",
  "password": "your-password"
}
```

#### 验证Token
```http
GET /api/auth/verify
Authorization: Bearer <token>
```

#### 用户登出
```http
POST /api/auth/logout
Authorization: Bearer <token>
```

### 图片上传接口

#### 文件上传（multipart/form-data）
```http
POST /api/upload/private
Authorization: Bearer <token>
Content-Type: multipart/form-data

file: <图片文件>
```

#### 公共上传（无需认证）
```http
POST /api/upload/public
Content-Type: multipart/form-data

file: <图片文件>
```

#### URL 上传
```http
POST /api/upload/url
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://example.com/image.jpg"
}
```

#### 批量 URL 上传
```http
POST /api/upload/urls
Authorization: Bearer <token>
Content-Type: application/json

{
  "urls": [
    "https://example.com/image1.jpg",
    "https://example.com/image2.jpg"
  ]
}
```

### 图片管理接口

#### 获取图片列表
```http
GET /api/images?page=1&limit=20
Authorization: Bearer <token>
```

#### 删除图片
```http
DELETE /api/images/{id}
Authorization: Bearer <token>
```

#### 批量删除图片
```http
DELETE /api/images/batch
Authorization: Bearer <token>
Content-Type: application/json

{
  "ids": ["id1", "id2", "id3"]
}
```

#### 获取违规图片
```http
GET /api/images/nsfw
Authorization: Bearer <token>
```

#### 取消违规标记
```http
PUT /api/images/{id}/unmark-nsfw
Authorization: Bearer <token>
```

### API Key 管理

#### 获取 API Key 列表
```http
GET /api/apikeys
Authorization: Bearer <token>
```

#### 创建 API Key
```http
POST /api/apikeys
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "My API Key",
  "description": "Description for this API key"
}
```

#### 更新 API Key
```http
PUT /api/apikeys/{id}
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Updated Name",
  "description": "Updated description"
}
```

#### 删除 API Key
```http
DELETE /api/apikeys/{id}
Authorization: Bearer <token>
```

### 系统设置接口

#### 获取设置
```http
GET /api/settings
Authorization: Bearer <token>
```

#### 更新设置
```http
PUT /api/settings
Authorization: Bearer <token>
Content-Type: application/json

{
  "appName": "My EasyImg",
  "maxFileSize": 10485760,
  "allowedFormats": ["jpg", "png", "gif"]
}
```

#### 获取统计信息
```http
GET /api/settings/stats
Authorization: Bearer <token>
```

### 通知配置接口

#### 获取通知配置
```http
GET /api/notification
Authorization: Bearer <token>
```

#### 更新通知配置
```http
PUT /api/notification
Authorization: Bearer <token>
Content-Type: application/json

{
  "webhook": {
    "enabled": true,
    "url": "https://your-webhook-url.com"
  },
  "telegram": {
    "enabled": false,
    "token": "",
    "chatId": ""
  }
}
```

#### 测试通知
```http
POST /api/notification/test
Authorization: Bearer <token>
Content-Type: application/json

{
  "type": "webhook"
}
```

### IP 黑名单接口

#### 获取黑名单列表
```http
GET /api/blacklist
Authorization: Bearer <token>
```

#### 添加 IP 到黑名单
```http
POST /api/blacklist
Authorization: Bearer <token>
Content-Type: application/json

{
  "ip": "192.168.1.1",
  "reason": "Spam uploads"
}
```

#### 从黑名单移除 IP
```http
DELETE /api/blacklist/{id}
Authorization: Bearer <token>
```

### 响应格式

#### 成功响应
```json
{
  "success": true,
  "data": {
    // 具体数据
  },
  "message": "操作成功"
}
```

#### 错误响应
```json
{
  "success": false,
  "error": {
    "code": "UNAUTHORIZED",
    "message": "未授权访问"
  }
}
```

### 错误代码

| 错误代码 | HTTP状态码 | 说明 |
|---------|-----------|------|
| `UNAUTHORIZED` | 401 | 未授权访问 |
| `FORBIDDEN` | 403 | 禁止访问 |
| `NOT_FOUND` | 404 | 资源不存在 |
| `VALIDATION_ERROR` | 400 | 参数验证失败 |
| `RATE_LIMIT_EXCEEDED` | 429 | 请求频率超限 |
| `INTERNAL_ERROR` | 500 | 服务器内部错误 |

### 使用 API Key 调用

除了 JWT Token，您也可以使用 API Key 进行认证：

```bash
curl -X GET "https://your-domain.com/api/images" \
  -H "X-API-Key: your-api-key-here"
```

### Q: 如何重置管理员密码？

连接到 MongoDB 数据库，删除 `users` 集合中的管理员账户后重启服务，系统会重新创建默认账户。

```javascript
// 使用 MongoDB Shell
use easyimg
db.users.deleteOne({ username: "easyimg" })
```

### Q: 如何备份数据？

备份 MongoDB 数据库和 uploads 目录即可，包含所有数据库数据和上传的图片。

```bash
# 备份 MongoDB 数据库
mongodump --uri="mongodb://localhost:27017/easyimg" --out=./backup

# 备份图片文件
cp -r uploads ./backup/
```

### Q: 支持哪些图片格式？

默认支持：JPEG、JPG、PNG、GIF、WebP、AVIF、SVG、BMP、ICO、APNG、TIFF



## 开源协议

[Apache-License2.0](LICENSE)