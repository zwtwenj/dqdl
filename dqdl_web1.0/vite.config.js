import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 斗气大陆 · 前端（重构版）
export default defineConfig({
  plugins: [
    // 关闭模板的 asset URL 转换，让 /image/xxx 走运行时直出后端静态服务
    vue({ template: { transformAssetUrls: [] } }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true, rewrite: (p) => p.replace(/^\/api/, '') },
      '/image': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
