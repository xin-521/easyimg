import { readFileSync } from 'fs'
import { resolve } from 'path'

// 在构建时读取 package.json 的版本号
const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), 'package.json'), 'utf-8'))
const appVersion = packageJson.version || '1.0.0'

export default defineNuxtConfig({
  ssr: true, // 启用 SSR 
  nitro: {
    preset: 'cloudflare-pages'
  },

  future: {
    compatibilityVersion: 4
  },

  compatibilityDate: '2025-12-12',

  modules: [
    '@pinia/nuxt',
    '@nuxt/icon'
  ],

  css: [
    '~/assets/css/main.css'
  ],

  postcss: {
    plugins: {
      tailwindcss: {},
      autoprefixer: {}
    }
  },

  app: {
    head: {
      title: 'EasyImg',
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: '简单易用的个人图床' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' }
      ]
    }
  },

  nitro: {
    // CORS 配置
    routeRules: {
      '/api/**': {
        cors: true,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key'
        }
      }
    }
  },

  runtimeConfig: {
    // 服务端运行时配置（不会暴露给客户端）
    appVersion,
    public: {
      apiBase: ''
    }
  }
})