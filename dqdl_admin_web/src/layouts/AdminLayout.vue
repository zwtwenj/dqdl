<script setup>
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ElMessageBox } from 'element-plus'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()

const menus = [
  { index: '/dashboard', title: 'Agent 日志总览', icon: '📈' },
  { index: '/agent-log', title: '调用明细', icon: '📋' },
  { index: '/agent-dialog', title: '对话明细', icon: '💬' },
  { index: '/db', title: '数据库浏览', icon: '🗄️' },
  { index: '/events', title: '事件管理', icon: '📜' },
]

function onMenu(index) {
  router.push(index)
}

async function onLogout() {
  await ElMessageBox.confirm('确定退出登录？', '提示', { type: 'warning' })
  auth.logout()
  router.push({ name: 'login' })
}
</script>

<template>
  <el-container class="layout">
    <el-aside width="220px" class="aside">
      <div class="logo">斗气大陆管理台</div>
      <el-menu :default-active="route.path" @select="onMenu">
        <el-menu-item v-for="m in menus" :key="m.index" :index="m.index">
          <span>{{ m.icon }} {{ m.title }}</span>
        </el-menu-item>
      </el-menu>
    </el-aside>
    <el-container>
      <el-header class="header">
        <div class="header-title">{{ route.meta.title || '管理平台' }}</div>
        <div class="header-user">
          <span>{{ auth.user?.nickname || auth.user?.username || '管理员' }}</span>
          <el-button link type="primary" @click="onLogout">退出</el-button>
        </div>
      </el-header>
      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<style scoped>
.layout {
  height: 100vh;
}
.aside {
  background: #304156;
}
.logo {
  height: 60px;
  line-height: 60px;
  text-align: center;
  color: #fff;
  font-size: 16px;
  font-weight: 600;
  letter-spacing: 1px;
}
.aside :deep(.el-menu) {
  background: #304156;
  border-right: none;
}
.aside :deep(.el-menu-item) {
  color: #bfcbd9;
}
.aside :deep(.el-menu-item.is-active) {
  background: #263445;
  color: #fff;
}
.header {
  background: #fff;
  border-bottom: 1px solid #e6e6e6;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.header-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.header-user {
  display: flex;
  align-items: center;
  gap: 12px;
  color: #606266;
}
.main {
  background: #f0f2f5;
  padding: 20px;
}
</style>
