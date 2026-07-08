<script setup>
/**
 * 历练日志组件：右侧面板，展示玩家历练日志。
 * 顶部 log-head.png 标题栏（点击打开本日志），中部纵向日志列表，底部历练按钮。
 * 按钮逻辑：
 *   - status=2(历练中) → 显示"停止历练"，点击 emit stop
 *   - status=1(空闲) + 非野外 → 显示"历练"但禁用，提示"请前往野外地图进行历练"
 *   - status=1(空闲) + 野外 → 显示"历练"，点击 emit start
 * 日志数据由父组件通过 logs prop 传入（来自 getActiveTraining 轮询）。
 * 收起后只显示标题栏。点击头部只表示打开（不切换关闭）。
 */
import { computed } from 'vue'

const props = defineProps({
  collapsed: { type: Boolean, default: false },
  status: { type: Number, default: 1 },
  locationType: { type: String, default: '' },
  logs: { type: Array, default: () => [] },
})

const emit = defineEmits(['tempering', 'stop', 'update:collapsed'])

/** 是否野外地图（响应式，随 locationType 变化） */
const isWild = computed(() =>
  ['wild', 'wild2', 'wild3'].includes(props.locationType),
)
/** 历练按钮是否禁用（非野外） */
const btnDisabled = computed(() => props.status === 1 && !isWild.value)

/**
 * 将日志文本按关键词高亮，返回 HTML 字符串。
 * keywords 来自每条日志自带（agent 输出）：[{ text, type }]
 * type: mob/location/skill/item/player
 */
function highlight(text, keywords) {
  if (!text) return ''
  // 转义 HTML
  let html = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // 收集关键词（去重 + 按长度降序，避免短词先匹配）
  const kws = []
  try {
    const arr = typeof keywords === 'string' ? JSON.parse(keywords) : keywords
    if (Array.isArray(arr)) {
      const seen = new Set()
      for (const k of arr) {
        if (k.text && !seen.has(k.text)) {
          seen.add(k.text)
          kws.push(k)
        }
      }
    }
  } catch {
    // ignore
  }
  kws.sort((a, b) => b.text.length - a.text.length)

  // 逐个关键词替换为带 class 的 span
  for (const kw of kws) {
    const cls = `hl-${kw.type || 'mob'}`
    const escaped = kw.text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    html = html.replace(new RegExp(escaped, 'g'), `<span class="${cls}">$&</span>`)
  }
  return html
}

/** 标题栏点击：打开本日志（不切换关闭） */
function openLog() {
  if (props.collapsed) {
    emit('update:collapsed', false)
  }
}

/** 点击历练按钮 */
function onTempering() {
  if (btnDisabled.value) return
  emit('tempering')
}

/** 点击停止历练 */
function onStop() {
  emit('stop')
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
      <span class="header-title">历练</span>
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
          src="/log/tempering.png"
          alt=""
        >
        <div class="log-content">
          <p
            class="log-text"
            v-html="highlight(log.content, log.keywords)"
          />
          <span class="log-time">{{ log.won ? '胜利' : '逃跑' }}</span>
        </div>
      </div>

      <!-- 空状态 -->
      <div
        v-if="logs.length === 0"
        class="log-empty"
      >
        暂无历练记录
      </div>
    </div>

    <!-- 底部按钮 -->
    <div
      v-show="!collapsed"
      class="log-actions"
    >
      <!-- 历练中：显示停止按钮 -->
      <button
        v-if="status === 2"
        class="action-btn stop"
        type="button"
        @click="onStop"
      >
        <img
          class="btn-bg"
          src="/log/btn.png"
          alt=""
        >
        <span class="btn-text">停止历练</span>
      </button>
      <!-- 空闲：显示历练按钮（非野外禁用） -->
      <button
        v-else
        class="action-btn"
        :class="{ disabled: btnDisabled }"
        type="button"
        :disabled="btnDisabled"
        :title="btnDisabled ? '请前往野外地图进行历练' : ''"
        @click="onTempering"
      >
        <img
          class="btn-bg"
          src="/log/btn.png"
          alt=""
        >
        <img
          class="btn-icon"
          src="/log/tempering.png"
          alt=""
        >
        <span class="btn-text">{{ btnDisabled ? '需野外地图' : '历练' }}</span>
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

      /* 关键词高亮配色 */
      :deep(.hl-mob) {
        color: #ff9080;
        font-weight: 600;
      }
      :deep(.hl-location) {
        color: #80c8ff;
        font-weight: 600;
      }
      :deep(.hl-skill) {
        color: #c8a0ff;
        font-weight: 600;
      }
      :deep(.hl-item) {
        color: #ffd870;
        font-weight: 600;
      }
      :deep(.hl-player) {
        color: #a0e8a0;
        font-weight: 600;
      }
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

  &:hover:not(.disabled) {
    filter: brightness(1.2);
    transform: translateY(-1px);
  }

  &:active:not(.disabled) {
    transform: translateY(0);
  }

  &.disabled {
    cursor: not-allowed;
    filter: grayscale(0.6) brightness(0.7);
  }

  &.stop .btn-text {
    color: #ff9080;
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
