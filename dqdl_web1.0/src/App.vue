<script setup>
// 斗气大陆 · 根组件：承载路由出口 + 全局 toast
import ToastMessage from './components/ToastMessage.vue'
</script>

<template>
  <router-view />
  <ToastMessage />
</template>
