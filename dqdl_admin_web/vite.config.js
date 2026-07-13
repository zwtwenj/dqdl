import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// 管理平台前端：端口 5174，/api 代理到管理后端 4000
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
})
