<script setup>
/**
 * 右下角功能图标栏：背包 / 角色 / 斗技 / 宝物 / 炼丹 / 任务 / 奇遇。
 * 图标来自 /icon/btn/。暂时只做 UI 占位，点击 emit 一个 select 事件并附带 key。
 */
import { ref } from 'vue'

defineEmits(['select'])

const items = [
  { key: 'bag', label: '背包', icon: '/icon/btn/bag.png' },
  { key: 'player', label: '角色', icon: '/icon/btn/player.png' },
  { key: 'skill', label: '斗技', icon: '/icon/btn/skill.png' },
  { key: 'treasure', label: '宝物', icon: '/icon/btn/treasure.png' },
  { key: 'pill', label: '炼丹', icon: '/icon/btn/pill.png' },
  { key: 'task', label: '任务', icon: '/icon/btn/task.png' },
  { key: 'encounter', label: '奇遇', icon: '/icon/btn/encounter.png' },
]

const active = ref(null)
</script>

<template>
  <div class="icon-toolbar">
    <button
      v-for="item in items"
      :key="item.key"
      class="icon-btn"
      :class="{ active: active === item.key }"
      type="button"
      :title="item.label"
      @click="active = item.key; $emit('select', item.key)"
    >
      <img
        :src="item.icon"
        :alt="item.label"
      >
      <span class="icon-label">{{ item.label }}</span>
    </button>
  </div>
</template>

<style scoped>
.icon-toolbar {
  position: absolute;
  right: 10px;
  bottom: 10px;
  z-index: 10;
  display: flex;
  align-items: flex-end;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(10, 8, 6, 0.5);
  border: 1px solid rgba(180, 150, 90, 0.25);
  border-radius: 8px;
  backdrop-filter: blur(4px);
}

.icon-btn {
  width: 54px;
  height: 54px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  padding: 0;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.icon-btn img {
  width: 34px;
  height: 34px;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
}

.icon-label {
  font-size: 10px;
  color: rgba(220, 200, 160, 0.85);
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
}

.icon-btn:hover {
  background: rgba(180, 150, 90, 0.15);
  border-color: rgba(200, 170, 100, 0.4);
  transform: translateY(-2px);
}

.icon-btn:hover .icon-label {
  color: #e8d5a0;
}

.icon-btn.active {
  background: rgba(200, 170, 100, 0.2);
  border-color: rgba(220, 190, 120, 0.6);
  box-shadow: 0 0 8px rgba(200, 170, 100, 0.3);
}
</style>
