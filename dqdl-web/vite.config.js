import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue({
      // 图片资源统一由后端提供（/image/* 经 server.proxy 转发）。
      // 关闭模板静态 src 的资源自动导入，让 <img src="/image/..."> 作为运行时 URL 直接 GET 后端，
      // 否则 Vite 会把它当成模块导入并代理到后端，后端返回图片 MIME 会导致模块加载失败（白屏）。
      template: { transformAssetUrls: false },
    }),
  ],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      '/image': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})
