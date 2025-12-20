<template>
  <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
    <h1 class="text-2xl font-bold text-gray-900 dark:text-white mb-8">系统设置</h1>

    <div class="space-y-6">
      <!-- 应用设置 -->
      <div class="card p-6">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">应用设置</h2>

        <form @submit.prevent="saveAppSettings" class="space-y-4">
          <!-- 应用名称 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              应用名称
            </label>
            <input
              v-model="appSettings.appName"
              type="text"
              class="input"
              placeholder="EasyImg"
            />
          </div>

          <!-- 应用 Logo -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              应用 Logo URL
            </label>
            <input
              v-model="appSettings.appLogo"
              type="text"
              class="input"
              placeholder="留空则使用默认图标"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              输入图片 URL，留空则显示默认图标
            </p>

            <!-- Logo 预览 -->
            <div v-if="appSettings.appLogo" class="mt-3 flex items-center gap-3">
              <span class="text-sm text-gray-600 dark:text-gray-400">预览：</span>
              <img
                :src="appSettings.appLogo"
                alt="Logo 预览"
                class="h-8 w-8 rounded-lg object-cover"
                @error="logoError = true"
              />
              <span v-if="logoError" class="text-sm text-red-500">图片加载失败</span>
            </div>
          </div>

          <!-- 全局背景图片 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              全局背景图片 URL
            </label>
            <input
              v-model="appSettings.backgroundUrl"
              type="text"
              class="input"
              placeholder="留空则使用默认背景"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              输入图片 URL 作为全局背景，留空则使用默认背景
            </p>

            <!-- 背景图片预览 -->
            <div v-if="appSettings.backgroundUrl" class="mt-3">
              <span class="text-sm text-gray-600 dark:text-gray-400">预览：</span>
              <div class="mt-2 relative rounded-lg overflow-hidden h-32 w-full max-w-md">
                <img
                  :src="appSettings.backgroundUrl"
                  alt="背景预览"
                  class="w-full h-full object-cover"
                  @error="backgroundError = true"
                />
                <div
                  v-if="appSettings.backgroundBlur > 0"
                  class="absolute inset-0 backdrop-blur"
                  :style="{ backdropFilter: `blur(${appSettings.backgroundBlur}px)` }"
                ></div>
              </div>
              <span v-if="backgroundError" class="text-sm text-red-500">图片加载失败</span>
            </div>
          </div>

          <!-- 毛玻璃效果 -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              毛玻璃效果：{{ appSettings.backgroundBlur }}px
            </label>
            <input
              v-model.number="appSettings.backgroundBlur"
              type="range"
              min="0"
              max="30"
              step="1"
              class="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>0px (无模糊)</span>
              <span>30px (最大模糊)</span>
            </div>
          </div>

          <!-- 站点 URL -->
          <div>
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              站点 URL(建议填写)
            </label>
            <input
              v-model="appSettings.siteUrl"
              type="text"
              class="input"
              placeholder="例如: https://example.com 或 http://127.0.0.1:8080"
            />
            <p class="mt-1 text-xs text-gray-500 dark:text-gray-400">
              用于通知消息中的图片完整链接，留空则自动使用请求时的 Host
            </p>
          </div>

          <div class="pt-4">
            <button type="submit" class="btn-primary" :disabled="savingApp">
              {{ savingApp ? '保存中...' : '保存设置' }}
            </button>
          </div>
        </form>
      </div>

      <!-- 公告设置 -->
      <div class="card p-6">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
          <Icon name="heroicons:megaphone" class="w-5 h-5 text-primary-500" />
          公告设置
        </h2>

        <form @submit.prevent="saveAnnouncementSettings" class="space-y-4">
          <!-- 启用开关 -->
          <div class="flex items-center justify-between">
            <div>
              <label class="text-sm font-medium text-gray-700 dark:text-gray-300">启用公告</label>
              <p class="text-xs text-gray-500 dark:text-gray-400">开启后每次刷新页面都会显示公告</p>
            </div>
            <button
              type="button"
              @click="announcementSettings.enabled = !announcementSettings.enabled"
              class="relative inline-flex h-6 w-11 items-center rounded-full transition-colors"
              :class="announcementSettings.enabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'"
            >
              <span
                class="inline-block h-4 w-4 transform rounded-full bg-white transition-transform"
                :class="announcementSettings.enabled ? 'translate-x-6' : 'translate-x-1'"
              />
            </button>
          </div>

          <!-- 展示形式 -->
          <div v-if="announcementSettings.enabled">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              展示形式
            </label>
            <div class="flex gap-4">
              <label class="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  v-model="announcementSettings.displayType"
                  value="modal"
                  class="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">弹窗提醒</span>
              </label>
              <label class="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  v-model="announcementSettings.displayType"
                  value="banner"
                  class="w-4 h-4 text-primary-600 border-gray-300 focus:ring-primary-500"
                />
                <span class="text-sm text-gray-700 dark:text-gray-300">顶部横幅</span>
              </label>
            </div>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              弹窗提醒：居中弹窗显示；顶部横幅：页面顶部显示，支持点击关闭
            </p>
          </div>

          <!-- 公告内容 -->
          <div v-if="announcementSettings.enabled">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              公告内容
            </label>
            <textarea
              v-model="announcementSettings.content"
              rows="6"
              class="input w-full font-mono text-sm"
              placeholder="请输入公告内容，支持 HTML 语法，例如：&#10;<p>欢迎使用 <strong>EasyImg</strong> 图床！</p>&#10;<p style='color: red;'>重要通知：系统将于今晚维护</p>"
            ></textarea>
            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
              支持 HTML 语法，可使用标签如 &lt;p&gt;、&lt;strong&gt;、&lt;a&gt;、&lt;span style="..."&gt; 等
            </p>
          </div>

          <!-- 预览 -->
          <div v-if="announcementSettings.enabled && announcementSettings.content" class="space-y-2">
            <label class="block text-sm font-medium text-gray-700 dark:text-gray-300">
              预览效果
            </label>
            <div class="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <div v-html="announcementSettings.content" class="prose prose-sm dark:prose-invert max-w-none"></div>
            </div>
          </div>

          <div class="pt-4">
            <button type="submit" class="btn-primary" :disabled="savingAnnouncement">
              {{ savingAnnouncement ? '保存中...' : '保存公告设置' }}
            </button>
          </div>
        </form>
      </div>

      <!-- 账户设置 -->
      <div class="card p-6">
        <h2 class="text-lg font-semibold text-gray-900 dark:text-white mb-4">账户设置</h2>

        <div class="space-y-6">
          <!-- 修改用户名 -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">修改用户名</h3>
            <form @submit.prevent="updateUsername" class="flex gap-3">
              <input
                v-model="newUsername"
                type="text"
                class="input flex-1"
                placeholder="新用户名"
              />
              <button type="submit" class="btn-secondary" :disabled="savingUsername">
                {{ savingUsername ? '保存中...' : '修改' }}
              </button>
            </form>
          </div>

          <!-- 修改密码 -->
          <div>
            <h3 class="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">修改密码</h3>
            <form @submit.prevent="updatePassword" class="space-y-3">
              <input
                v-model="passwordForm.oldPassword"
                type="password"
                class="input"
                placeholder="当前密码"
              />
              <input
                v-model="passwordForm.newPassword"
                type="password"
                class="input"
                placeholder="新密码"
              />
              <input
                v-model="passwordForm.confirmPassword"
                type="password"
                class="input"
                placeholder="确认新密码"
              />
              <button type="submit" class="btn-secondary" :disabled="savingPassword">
                {{ savingPassword ? '保存中...' : '修改密码' }}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, onMounted } from 'vue'
import { useAuthStore } from '~/stores/auth'
import { useSettingsStore } from '~/stores/settings'
import { useToastStore } from '~/stores/toast'

// 使用认证中间件
definePageMeta({
  middleware: 'auth'
})

const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const toastStore = useToastStore()

// 应用设置
const appSettings = reactive({
  appName: 'EasyImg',
  appLogo: '',
  backgroundUrl: '',
  backgroundBlur: 0,
  siteUrl: ''
})
const logoError = ref(false)
const backgroundError = ref(false)
const savingApp = ref(false)

// 公告设置
const announcementSettings = reactive({
  enabled: false,
  content: '',
  displayType: 'modal'  // 'modal' | 'banner'
})
const savingAnnouncement = ref(false)

// 账户设置
const newUsername = ref('')
const savingUsername = ref(false)

const passwordForm = reactive({
  oldPassword: '',
  newPassword: '',
  confirmPassword: ''
})
const savingPassword = ref(false)

// 保存应用设置
async function saveAppSettings() {
  savingApp.value = true
  logoError.value = false
  backgroundError.value = false

  try {
    const result = await settingsStore.saveAppSettings({
      appName: appSettings.appName,
      appLogo: appSettings.appLogo,
      backgroundUrl: appSettings.backgroundUrl,
      backgroundBlur: appSettings.backgroundBlur,
      siteUrl: appSettings.siteUrl,
      announcement: announcementSettings
    })

    if (result.success) {
      toastStore.success('设置已保存')
    } else {
      toastStore.error(result.message || '保存失败')
    }
  } catch (error) {
    toastStore.error('保存失败')
  } finally {
    savingApp.value = false
  }
}

// 保存公告设置
async function saveAnnouncementSettings() {
  savingAnnouncement.value = true

  try {
    const result = await settingsStore.saveAppSettings({
      appName: appSettings.appName,
      appLogo: appSettings.appLogo,
      backgroundUrl: appSettings.backgroundUrl,
      backgroundBlur: appSettings.backgroundBlur,
      siteUrl: appSettings.siteUrl,
      announcement: {
        enabled: announcementSettings.enabled,
        content: announcementSettings.content,
        displayType: announcementSettings.displayType
      }
    })

    if (result.success) {
      toastStore.success('公告设置已保存')
    } else {
      toastStore.error(result.message || '保存失败')
    }
  } catch (error) {
    toastStore.error('保存失败')
  } finally {
    savingAnnouncement.value = false
  }
}

// 修改用户名
async function updateUsername() {
  if (!newUsername.value.trim()) {
    toastStore.error('请输入新用户名')
    return
  }
  if (newUsername.value.trim().length < 3) {
    toastStore.error('用户名长度至少 3 位')
    return
  }

  savingUsername.value = true

  try {
    const response = await $fetch('/api/admin/username', {
      method: 'PUT',
      body: { username: newUsername.value.trim() },
      headers: authStore.authHeader
    })

    if (response.success) {
      authStore.updateUsername(newUsername.value.trim(), response.data?.token)
      toastStore.success('用户名已更新')
      newUsername.value = ''
    } else {
      toastStore.error(response.message || '更新失败')
    }
  } catch (error) {
    toastStore.error(error.data?.message || '更新失败')
  } finally {
    savingUsername.value = false
  }
}

// 修改密码
async function updatePassword() {
  if (!passwordForm.oldPassword) {
    toastStore.error('请输入当前密码')
    return
  }
  if (!passwordForm.newPassword) {
    toastStore.error('请输入新密码')
    return
  }
  if (passwordForm.newPassword.length < 6) {
    toastStore.error('新密码至少需要 6 个字符')
    return
  }
  if (passwordForm.newPassword !== passwordForm.confirmPassword) {
    toastStore.error('两次输入的密码不一致')
    return
  }

  savingPassword.value = true

  try {
    const response = await $fetch('/api/admin/password', {
      method: 'PUT',
      body: {
        oldPassword: passwordForm.oldPassword,
        newPassword: passwordForm.newPassword
      },
      headers: authStore.authHeader
    })

    if (response.success) {
      toastStore.success('密码已更新')
      passwordForm.oldPassword = ''
      passwordForm.newPassword = ''
      passwordForm.confirmPassword = ''
    } else {
      toastStore.error(response.message || '更新失败')
    }
  } catch (error) {
    toastStore.error(error.data?.message || '更新失败')
  } finally {
    savingPassword.value = false
  }
}

// 初始化
onMounted(async () => {
  // 获取应用设置（authStore.init() 已在插件中调用）
  await settingsStore.fetchAppSettings()

  // 同步到本地状态
  appSettings.appName = settingsStore.appSettings.appName || 'EasyImg'
  appSettings.appLogo = settingsStore.appSettings.appLogo || ''
  appSettings.backgroundUrl = settingsStore.appSettings.backgroundUrl || ''
  appSettings.backgroundBlur = settingsStore.appSettings.backgroundBlur || 0
  appSettings.siteUrl = settingsStore.appSettings.siteUrl || ''

  // 同步公告设置
  const announcement = settingsStore.appSettings.announcement || {}
  announcementSettings.enabled = announcement.enabled || false
  announcementSettings.content = announcement.content || ''
  announcementSettings.displayType = announcement.displayType || 'modal'

  // 设置当前用户名
  newUsername.value = ''
})
</script>