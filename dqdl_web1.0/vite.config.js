import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

// 斗气大陆 · 前端（重构版）
export default defineConfig({
  plugins: [
    // 关闭模板的 asset URL 转换，让 /image/xxx 走运行时直出后端静态服务
    vue({ template: { transformAssetUrls: [] } }),
  ],
  resolve: {
    // 快捷别名：@ 指向 src 目录
    // import x from '@/utils/foo' → src/utils/foo
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      // 后端有全局 /api 前缀，这里原样转发（不做 rewrite）
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/image': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
})
