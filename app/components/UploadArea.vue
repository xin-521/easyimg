<template>
  <div class="upload-section flex gap-4">
    <!-- 主上传区域 -->
    <div
      class="upload-area flex-1 relative border-2 border-dashed rounded-xl p-8 text-center transition-all duration-300"
      :class="[
        !configLoaded
          ? 'border-gray-200 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/30'
          : isDisabled
            ? 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 cursor-not-allowed'
            : isDragging
              ? 'border-primary-500 bg-primary-50 dark:bg-primary-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-500 cursor-pointer',
        isUploading ? 'pointer-events-none opacity-60' : ''
      ]"
      @click="triggerFileInput"
      @dragover.prevent="handleDragOver"
      @dragleave.prevent="handleDragLeave"
      @drop.prevent="handleDrop"
      tabindex="0"
      @keydown.enter="triggerFileInput"
    >
      <!-- 上传中遮罩 -->
      <div v-if="isUploading" class="absolute inset-0 flex items-center justify-center bg-white/80 dark:bg-gray-800/80 rounded-xl z-10">
        <div class="flex flex-col items-center">
          <Loading size="lg" />
          <span class="mt-3 text-gray-600 dark:text-gray-400">
            {{ uploadProgress }}
          </span>
        </div>
      </div>

      <!-- 内容区域 - 固定高度避免状态切换时高度变化 -->
      <div class="upload-content h-[148px]">
        <!-- 加载中骨架屏 - 配置未加载完成时显示 -->
        <template v-if="!configLoaded">
          <!-- 骨架图标 -->
          <div class="mb-4">
            <div class="w-16 h-16 mx-auto rounded-lg bg-gray-200 dark:bg-gray-700 animate-pulse"></div>
          </div>
          <!-- 骨架文字 -->
          <div class="space-y-3">
            <div class="h-7 w-64 mx-auto bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            <div class="h-5 w-80 mx-auto bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
            <div class="h-5 w-36 mx-auto bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>
          </div>
        </template>

        <!-- 禁用状态 -->
        <template v-else-if="isDisabled">
          <!-- 禁用图标 -->
          <div class="mb-4">
            <Icon name="heroicons:no-symbol" class="w-16 h-16 mx-auto text-gray-300 dark:text-gray-600" />
          </div>
          <!-- 禁用提示 -->
          <div class="space-y-3">
            <p class="text-lg font-medium text-gray-400 dark:text-gray-500">
              访客上传已禁用
            </p>
            <p class="text-sm text-gray-400 dark:text-gray-500">
              请登录后上传图片
            </p>
            <!-- 占位，保持高度一致 -->
            <p class="text-sm invisible">&nbsp;</p>
          </div>
        </template>

        <!-- 正常状态 -->
        <template v-else>
          <!-- 上传图标 -->
          <div class="">
            <Icon name="heroicons:cloud-arrow-up" class="w-16 h-16 mx-auto text-gray-400 dark:text-gray-500" />
          </div>

          <!-- 提示文字 -->
          <div class="space-y-3">
            <p class="text-lg font-medium text-gray-700 dark:text-gray-300">
              点击、拖拽或粘贴上传图片
              <span v-if="authStore.isAuthenticated">
                <span>{{ ' ' }} 或 {{ ' ' }}</span>
                <span
                  @click.stop="showUrlModal = true"
                  @keydown.enter="showUrlModal = true"
                  class="hover:text-primary-600 dark:hover:text-primary-500 cursor-pointer hover:underline transition-all duration-300"
                  >使用URL上传</span>
              </span>
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              支持 {{ allowedFormats.join(', ').toUpperCase() }} 格式，可选择多张
            </p>
            <p class="text-sm text-gray-500 dark:text-gray-400">
              单张最大 {{ formatFileSize(maxFileSize) }}
            </p>
          </div>
        </template>
      </div>

      <!-- 隐藏的文件输入（支持多选） -->
      <input
        ref="fileInput"
        type="file"
        :accept="acceptTypes"
        multiple
        class="hidden"
        @change="handleFileSelect"
      />
    </div>

    <!-- URL上传弹窗 -->
    <Modal
      :visible="showUrlModal"
      title="从URL上传图片"
      :confirm-text="urlUploadInProgress ? '上传中...' : '上传'"
      :confirm-disabled="urlUploadInProgress"
      @close="closeUrlModal"
      @confirm="handleUrlUpload"
    >
      <div class="space-y-4">
        <!-- URL输入区域 -->
        <div v-if="!urlUploadInProgress">
          <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            图片URL（每行一个，最多20个）
          </label>
          <textarea
            ref="urlInput"
            v-model="imageUrls"
            rows="6"
            placeholder="https://example.com/image1.jpg&#10;https://example.com/image2.jpg&#10;https://example.com/image3.jpg"
            class="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white resize-none font-mono text-sm"
          ></textarea>
          <p class="mt-2 text-sm text-gray-500 dark:text-gray-400">
            输入图片的HTTP/HTTPS链接，每行一个，系统将依次下载并保存到本地图库
          </p>
        </div>

        <!-- 上传进度展示 -->
        <div v-else class="space-y-3">
          <div class="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <span>下载进度</span>
            <span>{{ urlUploadProgress.completed }}/{{ urlUploadProgress.total }}</span>
          </div>

          <!-- 进度条 -->
          <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
            <div
              class="bg-primary-500 h-2 rounded-full transition-all duration-300"
              :style="{ width: `${(urlUploadProgress.completed / urlUploadProgress.total) * 100}%` }"
            ></div>
          </div>

          <!-- URL列表状态 -->
          <div class="max-h-64 overflow-y-auto space-y-2">
            <div
              v-for="(item, index) in urlUploadItems"
              :key="index"
              class="flex items-center gap-2 p-2 rounded-lg text-sm"
              :class="{
                'bg-gray-50 dark:bg-gray-800': item.status === 'pending',
                'bg-blue-50 dark:bg-blue-900/20': item.status === 'downloading',
                'bg-green-50 dark:bg-green-900/20': item.status === 'success',
                'bg-red-50 dark:bg-red-900/20': item.status === 'error'
              }"
            >
              <!-- 状态图标 -->
              <div class="flex-shrink-0">
                <Icon
                  v-if="item.status === 'pending'"
                  name="heroicons:clock"
                  class="w-4 h-4 text-gray-400"
                />
                <Icon
                  v-else-if="item.status === 'downloading'"
                  name="heroicons:arrow-down-tray"
                  class="w-4 h-4 text-blue-500 animate-bounce"
                />
                <Icon
                  v-else-if="item.status === 'success'"
                  name="heroicons:check-circle"
                  class="w-4 h-4 text-green-500"
                />
                <Icon
                  v-else-if="item.status === 'error'"
                  name="heroicons:x-circle"
                  class="w-4 h-4 text-red-500"
                />
              </div>

              <!-- URL文本 -->
              <div class="flex-1 min-w-0">
                <p class="truncate text-gray-700 dark:text-gray-300" :title="item.url">
                  {{ item.url }}
                </p>
                <p v-if="item.error" class="text-xs text-red-500 truncate" :title="item.error">
                  {{ item.error }}
                </p>
              </div>

              <!-- 序号 -->
              <span class="flex-shrink-0 text-xs text-gray-400">
                #{{ index + 1 }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </Modal>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useImagesStore } from '~/stores/images'
import { useSettingsStore } from '~/stores/settings'
import { useToastStore } from '~/stores/toast'

// 延迟函数
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

const authStore = useAuthStore()
const imagesStore = useImagesStore()
const settingsStore = useSettingsStore()
const toastStore = useToastStore()

const fileInput = ref(null)
const isDragging = ref(false)
const isUploading = ref(false)
const uploadProgress = ref('上传中...')
const configLoaded = ref(false)

// URL上传相关
const showUrlModal = ref(false)
const imageUrls = ref('')
const urlInput = ref(null)
const urlUploadInProgress = ref(false)
const urlUploadProgress = ref({ total: 0, completed: 0 })
const urlUploadItems = ref([])

// 监听弹窗打开，自动聚焦输入框
watch(showUrlModal, (visible) => {
  if (visible) {
    nextTick(() => {
      urlInput.value?.focus()
    })
  }
})

// 配置
const allowedFormats = ref(['jpeg', 'jpg', 'png', 'gif', 'webp', 'avif', 'svg', 'bmp', 'ico', 'apng', 'tiff', 'tif'])
const maxFileSize = ref(10 * 1024 * 1024) // 10MB
// 初始值为 null，表示配置尚未加载
const publicApiEnabled = ref(null)
const defaultApiKey = ref('')

// 计算是否禁用上传（未登录且公共上传已禁用）
// 配置未加载时（null），不显示禁用状态，避免闪烁
const isDisabled = computed(() => {
  if (!configLoaded.value) return false
  return !authStore.isAuthenticated && publicApiEnabled.value === false
})

// 计算接受的文件类型
const acceptTypes = computed(() => {
  const mimeMap = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'avif': 'image/avif',
    'svg': 'image/svg+xml',
    'bmp': 'image/bmp',
    'ico': 'image/x-icon',
    'apng': 'image/apng',
    'tiff': 'image/tiff',
    'tif': 'image/tiff'
  }
  return allowedFormats.value.map(f => mimeMap[f] || `image/${f}`).join(',')
})

// 格式化文件大小
function formatFileSize(bytes) {
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

// 获取配置
async function fetchConfig() {
  try {
    // 先获取公共 API 配置（用于判断访客上传是否启用）
    const publicResponse = await fetch('/api/config/public')
    if (publicResponse.ok) {
      const data = await publicResponse.json()
      if (data.success) {
        allowedFormats.value = data.data.allowedFormats || ['jpg', 'jpeg', 'png', 'gif', 'webp']
        publicApiEnabled.value = data.data.enabled !== false

        // 未登录用户使用公共 API 的文件大小限制
        if (!authStore.isAuthenticated) {
          maxFileSize.value = data.data.maxFileSize || 10 * 1024 * 1024
        }
      }
    }

    // 已登录用户获取私有 API 配置
    if (authStore.isAuthenticated) {
      try {
        const privateResponse = await fetch('/api/config/private', {
          headers: authStore.authHeader
        })
        if (privateResponse.ok) {
          const data = await privateResponse.json()
          if (data.success) {
            // 使用私有 API 的文件大小限制
            maxFileSize.value = data.data.maxFileSize || 100 * 1024 * 1024
          }
        }
      } catch (error) {
        console.error('获取私有配置失败:', error)
        // 回退到公共配置的限制
        maxFileSize.value = 10 * 1024 * 1024
      }
    }
  } catch (error) {
    console.error('获取配置失败:', error)
  } finally {
    // 标记配置已加载完成
    configLoaded.value = true
  }
}

// 获取默认 ApiKey（登录用户）
async function fetchDefaultApiKey() {
  if (!authStore.isAuthenticated) return

  try {
    await settingsStore.fetchApiKeys()
    const keys = settingsStore.apiKeys
    if (keys && keys.length > 0) {
      const defaultKey = keys.find(k => k.isDefault) || keys[0]
      defaultApiKey.value = defaultKey.key
    }
  } catch (error) {
    console.error('获取 ApiKey 失败:', error)
  }
}

// 触发文件选择
function triggerFileInput() {
  if (!isUploading.value && !isDisabled.value) {
    fileInput.value?.click()
  }
}

// 处理文件选择（支持多文件）
function handleFileSelect(event) {
  const files = event.target.files
  if (files?.length) {
    uploadFiles(Array.from(files))
  }
  // 清空 input 以便重复选择同一文件
  event.target.value = ''
}

// 处理拖拽
function handleDragOver(event) {
  isDragging.value = true
}

function handleDragLeave(event) {
  isDragging.value = false
}

function handleDrop(event) {
  isDragging.value = false
  if (isDisabled.value) return
  const files = event.dataTransfer?.files
  if (files?.length) {
    uploadFiles(Array.from(files))
  }
}

// 处理粘贴
function handlePaste(event) {
  if (isDisabled.value) return
  const items = event.clipboardData?.items
  if (!items) return

  const files = []
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile()
      if (file) {
        files.push(file)
      }
    }
  }

  if (files.length > 0) {
    uploadFiles(files)
  }
}

// 全局粘贴监听
function globalPasteHandler(event) {
  // 如果焦点在输入框中，不处理
  if (event.target.tagName === 'INPUT' || event.target.tagName === 'TEXTAREA') {
    return
  }
  handlePaste(event)
}

// 验证单个文件
function validateFile(file) {
  // 验证文件类型
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (!allowedFormats.value.includes(ext)) {
    return { valid: false, error: `${file.name}: 不支持的图片格式` }
  }

  // 验证文件大小
  if (file.size > maxFileSize.value) {
    return { valid: false, error: `${file.name}: 文件大小超过限制` }
  }

  return { valid: true }
}

// 上传单个文件
async function uploadSingleFile(file) {
  const formData = new FormData()
  formData.append('file', file)

  // 根据登录状态选择 API
  const url = authStore.isAuthenticated ? '/api/upload/private' : '/api/upload/public'
  const headers = {}

  if (authStore.isAuthenticated && defaultApiKey.value) {
    headers['X-API-Key'] = defaultApiKey.value
  }

  let response
  try {
    response = await fetch(url, {
      method: 'POST',
      headers,
      body: formData
    })
  } catch (error) {
    // 网络错误
    throw new Error('网络连接失败，请检查网络后重试')
  }

  let data
  try {
    data = await response.json()
  } catch (error) {
    // JSON解析错误
    throw new Error('服务器响应格式错误')
  }

  if (response.ok && data.success) {
    return { success: true, filename: file.name, data: data.data }
  } else {
    const errorMessage = data.message || data.error?.message || '上传失败'
    return { success: false, filename: file.name, error: errorMessage }
  }
}

// 上传多个文件（串行上传，避免浏览器并发限制导致失败）
async function uploadFiles(files) {
  // 检查公共 API 是否启用（未登录时）
  if (!authStore.isAuthenticated && !publicApiEnabled.value) {
    toastStore.error('访客上传已禁用，请登录后上传')
    return
  }

  // 过滤出有效的图片文件
  const validFiles = []
  const errors = []

  for (const file of files) {
    const validation = validateFile(file)
    if (validation.valid) {
      validFiles.push(file)
    } else {
      errors.push(validation.error)
    }
  }

  // 显示验证错误
  if (errors.length > 0) {
    errors.forEach(err => toastStore.error(err))
  }

  if (validFiles.length === 0) {
    return
  }

  isUploading.value = true
  let successCount = 0
  let failCount = 0
  const failedFiles = []

  try {
    // 串行上传，每次间隔 100ms 避免给服务器造成压力
    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i]
      uploadProgress.value = `上传中 (${i + 1}/${validFiles.length})...`

      try {
        const result = await uploadSingleFile(file)
        if (result.success) {
          successCount++
        } else {
          failCount++
          failedFiles.push({ name: file.name, error: result.error })
          toastStore.error(`${result.filename}: ${result.error}`)
        }
      } catch (error) {
        failCount++
        const errorMessage = error.message || '上传失败'
        failedFiles.push({ name: file.name, error: errorMessage })
        toastStore.error(`${file.name}: ${errorMessage}`)
      }

      // 如果不是最后一个文件，等待 100ms 再上传下一个
      if (i < validFiles.length - 1) {
        await delay(100)
      }
    }

    // 显示最终结果
    if (successCount > 0) {
      if (failCount > 0) {
        toastStore.success(`成功上传 ${successCount} 张，失败 ${failCount} 张`)
      } else {
        toastStore.success(`成功上传 ${successCount} 张图片`)
      }
      // 刷新图片列表
      await imagesStore.fetchImages(true)
    } else if (failCount > 0) {
      toastStore.error('所有文件上传失败')
    }
  } catch (error) {
    console.error('上传失败:', error)
    toastStore.error('上传失败，请稍后重试')
  } finally {
    isUploading.value = false
    uploadProgress.value = '上传中...'
  }
}

// 关闭URL上传弹窗
function closeUrlModal() {
  // 如果正在上传，不允许关闭
  if (urlUploadInProgress.value) {
    return
  }
  showUrlModal.value = false
  imageUrls.value = ''
  urlUploadItems.value = []
  urlUploadProgress.value = { total: 0, completed: 0 }
}

// 处理URL上传（支持多个URL）
async function handleUrlUpload() {
  // 如果正在上传，不重复触发
  if (urlUploadInProgress.value) {
    return
  }

  // 解析多行URL
  const urls = imageUrls.value
    .split('\n')
    .map(u => u.trim())
    .filter(u => u.length > 0)

  if (urls.length === 0) {
    toastStore.error('请输入至少一个图片URL')
    return
  }

  // 限制数量
  if (urls.length > 20) {
    toastStore.error('最多支持20个URL')
    return
  }

  // 验证所有URL格式
  const invalidUrls = []
  for (const url of urls) {
    try {
      const urlObj = new URL(url)
      if (!['http:', 'https:'].includes(urlObj.protocol)) {
        invalidUrls.push(url)
      }
    } catch (e) {
      invalidUrls.push(url)
    }
  }

  if (invalidUrls.length > 0) {
    toastStore.error(`${invalidUrls.length} 个URL格式无效`)
    return
  }

  // 初始化上传状态
  urlUploadInProgress.value = true
  urlUploadProgress.value = { total: urls.length, completed: 0 }
  urlUploadItems.value = urls.map(url => ({
    url,
    status: 'pending',
    error: null,
    data: null
  }))

  try {
    // 使用fetch发送POST请求，然后读取SSE响应
    let response
    try {
      response = await fetch('/api/upload/urls', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authStore.authHeader
        },
        body: JSON.stringify({ urls })
      })
    } catch (error) {
      throw new Error('网络连接失败，请检查网络后重试')
    }

    if (!response.ok) {
      let errorData
      try {
        errorData = await response.json()
      } catch (e) {
        throw new Error('服务器响应错误')
      }
      throw new Error(errorData.message || '上传失败')
    }

    // 读取SSE流
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      let result
      try {
        result = await reader.read()
      } catch (error) {
        throw new Error('数据流读取失败')
      }
      
      const { done, value } = result
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // 解析SSE事件
      const lines = buffer.split('\n')
      buffer = lines.pop() || '' // 保留不完整的行

      let eventType = ''
      let eventData = ''

      for (const line of lines) {
        if (line.startsWith('event: ')) {
          eventType = line.slice(7)
        } else if (line.startsWith('data: ')) {
          eventData = line.slice(6)

          if (eventType && eventData) {
            try {
              const data = JSON.parse(eventData)
              handleSSEEvent(eventType, data)
            } catch (e) {
              console.error('解析SSE数据失败:', e)
            }
            eventType = ''
            eventData = ''
          }
        }
      }
    }

  } catch (error) {
    console.error('URL上传失败:', error)
    toastStore.error(error.message || '上传失败，请稍后重试')
  } finally {
    urlUploadInProgress.value = false
    // 刷新图片列表
    if (urlUploadProgress.value.completed > 0) {
      await imagesStore.fetchImages(true)
    }
  }
}

// 处理SSE事件
function handleSSEEvent(eventType, data) {
  switch (eventType) {
    case 'start':
      // 开始事件，可以更新总数
      urlUploadProgress.value.total = data.total
      break

    case 'progress':
      // 进度事件，更新对应URL的状态
      const index = data.index - 1 // 后端是1-based
      if (index >= 0 && index < urlUploadItems.value.length) {
        urlUploadItems.value[index].status = data.status
        if (data.error) {
          urlUploadItems.value[index].error = data.error
        }
        if (data.data) {
          urlUploadItems.value[index].data = data.data
        }
        // 更新完成数
        if (data.status === 'success' || data.status === 'error') {
          urlUploadProgress.value.completed = data.index
        }
      }
      break

    case 'complete':
      // 完成事件
      const { successCount, failCount } = data
      if (successCount > 0 && failCount === 0) {
        toastStore.success(`成功下载 ${successCount} 张图片`)
      } else if (successCount > 0 && failCount > 0) {
        toastStore.success(`成功 ${successCount} 张，失败 ${failCount} 张`)
      } else if (failCount > 0) {
        toastStore.error(`全部下载失败`)
      }
      break

    case 'error':
      // 错误事件
      toastStore.error(data.message || '上传过程中发生错误')
      break
  }
}

onMounted(async () => {
  await fetchConfig()
  await fetchDefaultApiKey()
  document.addEventListener('paste', globalPasteHandler)
})

onUnmounted(() => {
  document.removeEventListener('paste', globalPasteHandler)
})
</script>

<style scoped>
.upload-area:focus {
  outline: none;
  @apply ring-2 ring-primary-500 ring-offset-2;
}
</style>
