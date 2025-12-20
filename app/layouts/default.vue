<template>
  <div class="min-h-screen flex flex-col relative">
    <!-- 全局背景图片 -->
    <div
      v-if="backgroundUrl"
      class="fixed inset-0 z-0"
    >
      <img
        :src="backgroundUrl"
        alt="背景"
        class="w-full h-full object-cover"
      />
      <div
        v-if="backgroundBlur > 0"
        class="absolute inset-0"
        :style="{ backdropFilter: `blur(${backgroundBlur}px)`, WebkitBackdropFilter: `blur(${backgroundBlur}px)` }"
      ></div>
      <!-- 背景遮罩层，确保内容可读性 -->
      <div class="absolute inset-0 bg-white/30 dark:bg-gray-900/50"></div>
    </div>

    <!-- 顶部导航栏 -->
    <header class="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b border-gray-200 dark:border-gray-700">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex items-center justify-between h-16">
          <!-- 左侧：Logo + 应用名称 -->
          <NuxtLink to="/" class="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img
              v-if="appLogo"
              :src="appLogo"
              :alt="appName"
              class="h-8 w-8 rounded-lg object-cover"
            />
            <div
              v-else
              class="h-8 w-8 rounded-lg bg-gradient-to-br from-primary-500 to-primary-600 flex items-center justify-center"
            >
              <Icon name="heroicons:photo" class="w-5 h-5 text-white" />
            </div>
            <span class="text-xl font-bold text-gray-900 dark:text-white">{{ appName }}</span>
          </NuxtLink>

          <!-- 右侧：导航菜单 -->
          <nav class="flex items-center gap-1 sm:gap-2">
            <!-- 首页 -->
            <NuxtLink
              to="/"
              class="nav-link"
              :class="{ 'nav-link-active': route.path === '/' }"
            >
              <Icon name="heroicons:home" class="w-5 h-5 sm:hidden" />
              <span class="hidden sm:inline">首页</span>
            </NuxtLink>

            <!-- API -->
            <NuxtLink
              v-if="authStore.isAuthenticated"
              to="/api"
              class="nav-link"
              :class="{ 'nav-link-active': route.path === '/api' }"
            >
              <Icon name="heroicons:code-bracket" class="w-5 h-5 sm:hidden" />
              <span class="hidden sm:inline">API</span>
            </NuxtLink>

            <!-- 设置 -->
            <NuxtLink
              v-if="authStore.isAuthenticated"
              to="/settings"
              class="nav-link"
              :class="{ 'nav-link-active': route.path === '/settings' }"
            >
              <Icon name="heroicons:cog-6-tooth" class="w-5 h-5 sm:hidden" />
              <span class="hidden sm:inline">设置</span>
            </NuxtLink>

            <!-- 统计 -->
            <NuxtLink
              v-if="authStore.isAuthenticated"
              to="/stats"
              class="nav-link"
              :class="{ 'nav-link-active': route.path === '/stats' }"
            >
              <Icon name="heroicons:chart-bar" class="w-5 h-5 sm:hidden" />
              <span class="hidden sm:inline">统计</span>
            </NuxtLink>

            <!-- 通知 -->
            <NuxtLink
              v-if="authStore.isAuthenticated"
              to="/notification"
              class="nav-link"
              :class="{ 'nav-link-active': route.path === '/notification' }"
            >
              <Icon name="heroicons:bell" class="w-5 h-5 sm:hidden" />
              <span class="hidden sm:inline">通知</span>
            </NuxtLink>

            <!-- 分隔线 -->
            <div class="w-px h-6 bg-gray-200 dark:bg-gray-700 mx-1 sm:mx-2"></div>

            <!-- 登录/登出 -->
            <button
              v-if="authStore.isAuthenticated"
              @click="handleLogout"
              class="nav-link text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20"
            >
              <Icon name="heroicons:arrow-right-on-rectangle" class="w-5 h-5 sm:hidden" />
              <span class="hidden sm:inline">登出</span>
            </button>
            <NuxtLink
              v-else
              to="/login"
              class="nav-link"
              :class="{ 'nav-link-active': route.path === '/login' }"
            >
              <Icon name="heroicons:arrow-left-on-rectangle" class="w-5 h-5 sm:hidden" />
              <span class="hidden sm:inline">登录</span>
            </NuxtLink>

            <!-- 暗黑模式切换 -->
            <ThemeToggle />
          </nav>
        </div>
      </div>
    </header>

    <!-- 主内容区域 -->
    <main class="flex-1 relative z-10">
      <slot />
    </main>

    <!-- Toast 组件 -->
    <Toast />
  </div>
</template>

<script setup>
import { useAuthStore } from '~/stores/auth'
import { useSettingsStore } from '~/stores/settings'
import { useToastStore } from '~/stores/toast'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const settingsStore = useSettingsStore()
const toastStore = useToastStore()

// 应用配置
const appName = computed(() => settingsStore.appSettings.appName || 'EasyImg')
const appLogo = computed(() => settingsStore.appSettings.appLogo || '/favicon.png')
const backgroundUrl = computed(() => settingsStore.appSettings.backgroundUrl || '')
const backgroundBlur = computed(() => settingsStore.appSettings.backgroundBlur || 0)

// 动态设置页面标题
useHead({
  title: appName
})

// 初始化
onMounted(async () => {
  // 先获取公共应用设置（无需登录，包含背景图片等）
  await settingsStore.fetchPublicAppSettings()

  // 验证 Token（authStore.init() 已在插件中调用）
  if (authStore.token) {
    await authStore.verify()
  }

  // 获取完整应用设置（如果已登录）
  if (authStore.isAuthenticated) {
    await settingsStore.fetchAppSettings()
  }
})

// 登出处理
async function handleLogout() {
  authStore.logout()
  toastStore.success('已退出登录')
  router.push('/')
}
</script>

<style scoped>
.nav-link {
  @apply px-3 py-2 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors;
}

.nav-link-active {
  @apply bg-primary-50 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400;
}
</style>