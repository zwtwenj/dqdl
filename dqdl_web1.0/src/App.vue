<script setup>
// 斗气大陆 · 根组件：承载路由出口 + 全局 toast + 全局确认框 + 全局 NPC 对话/商店/交易/奇遇/秘境/修炼/任务详情/场景分支对话
import ToastMessage from './components/ToastMessage.vue'
import ConfirmBox from '@/components1/confirm.vue'
import NpcDialog from './components/NpcDialog.vue'
import NpcShopPanel from './components/NpcShopPanel.vue'
import Transaction from './components/dialog/transaction.vue'
import Adventure from './components/dialog/adventure.vue'
import DungeonPanel from './components/dialog/dungeonPanel.vue'
import CultivationDetails from './components/dialog/cultivationDetails.vue'
import DungeonDetails from './components/dialog/dungeonDetails.vue'
import BattlePanel from './components/dialog/battlePanel.vue'
import TaskDetails from './components/dialog/taskDetails.vue'
import SceneBranchDialog from './components/SceneBranchDialog.vue'
</script>

<template>
  <router-view />
  <ToastMessage />
  <ConfirmBox />
  <NpcDialog />
  <NpcShopPanel />
  <Transaction />
  <Adventure />
  <DungeonPanel />
  <CultivationDetails />
  <DungeonDetails />
  <BattlePanel />
  <TaskDetails />
  <SceneBranchDialog />
</template>
