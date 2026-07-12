<script setup>
// 斗气大陆 · 根组件：承载路由出口 + 全局 toast + 全局 NPC 对话/商店
import ToastMessage from './components/ToastMessage.vue'
import NpcDialog from './components/NpcDialog.vue'
import NpcShopPanel from './components/NpcShopPanel.vue'
</script>

<template>
  <router-view />
  <ToastMessage />
  <NpcDialog />
  <NpcShopPanel />
</template>
