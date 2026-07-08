<script setup>
/**
 * 采集日志组件：右侧面板，展示玩家采集日志。
 * 顶部 log-head.png 标题栏（点击打开本日志），中部纵向日志列表，底部采集按钮。
 * 日志条目：左侧图标（collect）+ 右侧文字内容。
 * 收起后只显示标题栏。用 v-model:collapsed 双向绑定收起状态。
 * 点击头部只表示打开（不切换关闭），关闭由互斥逻辑（另一个日志打开）驱动。
 * 当前用假数据，后续接后端日志/事件推送。
 */
import { ref } from 'vue'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
})

const emit = defineEmits(['collect', 'update:collapsed'])

/* 假数据：日志列表（最新在上） */
const logs = ref([
  { id: 1, text: '采集到「赤血藤」×3，获得修为 +10', time: '刚刚' },
  { id: 3, text: '采集到「清灵花」×1', time: '5分钟前' },
  { id: 5, text: '采集到「回气草」×2，获得修为 +8', time: '15分钟前' },
])

/** 标题栏点击：打开本日志（不切换关闭） */
function openLog() {
  if (props.collapsed) {
    emit('update:collapsed', false)
  }
}

/** 点击采集按钮 */
function onCollect() {
  emit('collect')
  logs.value.unshift({
    id: Date.now(),
    text: '开始采集...',
    time: '刚刚',
  })
}
</script>

<template>
  <div
    class="adventure-log"
    :class="{ collapsed }"
  >
    <!-- 标题栏：点击打开本日志 -->
    <div
      class="log-header"
      @click="openLog"
    >
      <img
        class="header-bg"
        src="/log/log-head.png"
        alt=""
      >
      <span class="header-title">采集</span>
      <span class="header-arrow">{{ collapsed ? '▼' : '▲' }}</span>
    </div>

    <!-- 日志列表 -->
    <div
      v-show="!collapsed"
      class="log-list"
    >
      <div
        v-for="log in logs"
        :key="log.id"
        class="log-item"
      >
        <img
          class="log-icon"
          src="/log/collect.png"
          alt=""
        >
        <div class="log-content">
          <p class="log-text">
            {{ log.text }}
          </p>
          <span class="log-time">{{ log.time }}</span>
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-if="logs.length === 0"
        class="log-empty"
      >
        暂无采集记录
      </div>
    </div>

    <!-- 底部按钮 -->
    <div
      v-show="!collapsed"
      class="log-actions"
    >
      <button
        class="action-btn"
        type="button"
        @click="onCollect"
      >
        <img
          class="btn-bg"
          src="/log/btn.png"
          alt=""
        >
        <img
          class="btn-icon"
          src="/log/collect.png"
          alt=""
        >
        <span class="btn-text">采集</span>
      </button>
    </div>
  </div>
</template>

<style lang="less" scoped>
.adventure-log {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  background: linear-gradient(180deg, rgba(28, 22, 16, 0.88), rgba(14, 11, 8, 0.92));
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(220, 190, 120, 0.1);
  overflow: hidden;
  transition: flex 0.3s ease;

  &.collapsed {
    flex: none;
  }
}

.log-header {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 50px;
  cursor: pointer;
  user-select: none;

  &:hover {
    filter: brightness(1.1);
  }

  .header-bg {
    width: 100%;
    height: 100%;
    object-fit: fill;
  }

  .header-title {
    position: absolute;
    font-size: 16px;
    color: #f0d890;
    letter-spacing: 6px;
    font-family: 'STKaiti', 'KaiTi', '楷体', serif;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
    pointer-events: none;
    left: 20px;
  }

  .header-arrow {
    position: absolute;
    right: 12px;
    font-size: 12px;
    color: rgba(200, 168, 104, 0.7);
    pointer-events: none;
  }
}

.log-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  background: linear-gradient(180deg, rgba(28, 22, 16, 0.88), rgba(14, 11, 8, 0.92));
  z-index: 3;

  &::-webkit-scrollbar {
    width: 4px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(180, 150, 90, 0.3);
    border-radius: 2px;
  }
}

.log-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 8px 10px;
  background: linear-gradient(180deg, rgba(36, 28, 18, 0.6), rgba(20, 16, 10, 0.7));
  border: 1px solid rgba(180, 150, 90, 0.15);
  border-radius: 4px;
  transition: border-color 0.2s;

  &:hover {
    border-color: rgba(200, 170, 100, 0.35);
  }

  .log-icon {
    width: 20px;
    height: 20px;
    object-fit: contain;
    flex-shrink: 0;
    margin-top: 1px;
    filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
  }

  .log-content {
    flex: 1;
    min-width: 0;

    .log-text {
      margin: 0;
      font-size: 12px;
      line-height: 1.5;
      color: #d8c8a0;
      letter-spacing: 0.5px;
      font-family: 'STKaiti', 'KaiTi', '楷体', serif;
      text-shadow: 0 1px 1px rgba(0, 0, 0, 0.7);
    }

    .log-time {
      font-size: 10px;
      color: rgba(200, 180, 140, 0.45);
      letter-spacing: 0.5px;
    }
  }
}

.log-empty {
  padding: 40px 0;
  text-align: center;
  font-size: 13px;
  color: rgba(200, 180, 140, 0.35);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

.log-actions {
  flex-shrink: 0;
  display: flex;
  gap: 10px;
  padding: 10px;
  border-top: 1px solid rgba(180, 150, 90, 0.3);
  background: linear-gradient(180deg, rgba(20, 16, 10, 0.4), rgba(28, 22, 16, 0.6));
  z-index: 3;
}

.action-btn {
  position: relative;
  flex: 1;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 0;
  background: transparent;
  border: none;
  cursor: pointer;
  transition: filter 0.2s, transform 0.2s;

  &:hover {
    filter: brightness(1.2);
    transform: translateY(-1px);
  }

  &:active {
    transform: translateY(0);
  }

  .btn-bg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: fill;
  }

  .btn-icon {
    position: relative;
    z-index: 1;
    width: 18px;
    height: 18px;
    object-fit: contain;
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.8));
  }

  .btn-text {
    position: relative;
    z-index: 1;
    font-size: 13px;
    color: #f0e0b0;
    letter-spacing: 3px;
    font-family: 'STKaiti', 'KaiTi', '楷体', serif;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  }
}
</style>
