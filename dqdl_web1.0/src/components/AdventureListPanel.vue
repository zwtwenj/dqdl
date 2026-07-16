<script setup>
/**
 * 奇遇列表弹窗（浮动面板，左上角，暗金 RPG 风格）。
 *
 * 原子化触发：bus.on(ADVENTURE_OPEN) 打开 → 拉取玩家 pending 奇遇列表。
 * 点奇遇卡片展开详情子弹层（仿 NpcShopPanel 的 buyModal）。
 * 「进入」按钮：dungeon→秘境面板，cultivate→洞天福地修炼面板。
 * 「放弃」按钮调后端移除该奇遇。
 *
 * 暗金风格与 NpcShopPanel 一致：CSS 渐变 + 楷体 + 金色描边。
 */
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'
import { getEncounters, abandonEncounter } from '../api'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'

const { z, focus, mount, unmount } = usePanelStack('adventure')

const open = ref(false)
const loading = ref(false)
const list = ref([])
const selected = ref(null) // 详情子弹层当前奇遇
const abandoning = ref(false)

/* ============ 拖拽（标题栏作手柄） ============ */
const panelRef = ref(null)
const pos = ref(null)
const { dragging, onHandlePointerDown } = usePanelDraggable({
  elRef: panelRef,
  pos,
  onStart: focus,
})

watch(open, (v) => {
  v ? mount() : unmount()
})

/** 打开：拉取列表 */
async function handleOpen() {
  open.value = true
  focus()
  selected.value = null
  await loadList()
}

async function loadList() {
  loading.value = true
  try {
    list.value = await getEncounters()
  } catch (e) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: e.message || '奇遇列表加载失败' })
  } finally {
    loading.value = false
  }
}

function close() {
  open.value = false
}

/** 类型徽章文案 */
function kindLabel(enc) {
  return enc.kind === 'cultivate' ? '洞天福地' : '秘境入口'
}

/** 星级渲染（仅 cultivate） */
function starText(enc) {
  if (!enc.star) return ''
  return '★'.repeat(enc.star)
}

/** 点击卡片 → 打开详情 */
function onCardClick(enc) {
  selected.value = enc
}

/** 放弃奇遇 */
async function onAbandon() {
  if (!selected.value || abandoning.value) return
  abandoning.value = true
  try {
    list.value = await abandonEncounter(selected.value.id)
    selected.value = null
    bus.emit(BusEvents.TOAST, { type: 'info', message: '已放弃该奇遇' })
  } catch (e) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: e.message || '放弃失败' })
  } finally {
    abandoning.value = false
  }
}

/**
 * 进入奇遇：
 * - dungeon 类型：
 *   · pending（未进入）→ 带 encounterId，DungeonPanel 会生成新秘境
 *   · entered（探索中）→ 不带 encounterId，DungeonPanel 走 getCurrent 恢复进行中的秘境
 * - cultivate（洞天福地）：带 encounterId 触发修炼面板（消耗奇遇、SSE 结算修为）
 */
function onEnter() {
  if (!selected.value) return
  if (selected.value.kind === 'dungeon') {
    const payload = selected.value.status === 'entered'
      ? {} // entered：恢复进行中的秘境，不重新生成
      : { encounterId: selected.value.id } // pending：生成新秘境
    bus.emit(BusEvents.DUNGEON_OPEN, payload)
    selected.value = null // 关闭详情子弹层
    open.value = false    // 收起奇遇列表
    return
  }
  if (selected.value.kind === 'cultivate') {
    bus.emit(BusEvents.CULTIVATION_OPEN, { encounterId: selected.value.id })
    selected.value = null
    open.value = false
    return
  }
}

let offOpen = null
onMounted(() => {
  offOpen = bus.on(BusEvents.ADVENTURE_OPEN, handleOpen)
})
onUnmounted(() => {
  offOpen && offOpen()
  unmount()
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="panelRef"
      class="adv-panel"
      :class="{ 'is-dragging': dragging }"
      :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto', zIndex: z } : { zIndex: z }"
      @pointerdown="focus"
    >
      <!-- 标题栏（拖拽手柄） -->
      <div
        class="adv-header"
        @pointerdown="onHandlePointerDown"
      >
        <span class="adv-title">✦ 奇遇</span>
        <button
          class="adv-close"
          type="button"
          @pointerdown.stop
          @click="close"
        >
          ×
        </button>
      </div>

      <!-- 列表 -->
      <div class="adv-body">
        <div
          v-if="loading"
          class="adv-empty"
        >
          正在探查机缘...
        </div>
        <div
          v-else-if="!list.length"
          class="adv-empty"
        >
          暂未发现奇遇，历练中或有机缘
        </div>
        <div
          v-else
          class="adv-list"
        >
          <div
            v-for="enc in list"
            :key="enc.id"
            class="adv-card"
            :class="{ 'is-entered': enc.status === 'entered' }"
            @click="onCardClick(enc)"
          >
            <div class="adv-card-top">
              <span class="adv-card-title">{{ enc.title }}</span>
              <span
                v-if="enc.status === 'entered'"
                class="adv-card-status"
              >探索中</span>
              <span
                class="adv-card-badge"
                :class="{ cultivate: enc.kind === 'cultivate' }"
              >{{ kindLabel(enc) }}</span>
            </div>
            <div class="adv-card-desc">{{ enc.description }}</div>
            <div
              v-if="enc.star"
              class="adv-card-star"
            >{{ starText(enc) }}</div>
          </div>
        </div>
      </div>

      <!-- 详情子弹层 -->
      <Teleport to="body">
        <div
          v-if="selected"
          class="detail-overlay"
        >
          <div class="detail-box">
            <div class="detail-header">
              <span class="detail-title">{{ selected.title }}</span>
              <button
                class="adv-close"
                type="button"
                @click="selected = null"
              >×</button>
            </div>
            <div class="detail-body">
              <div class="detail-meta">
                <span
                  class="adv-card-badge"
                  :class="{ cultivate: selected.kind === 'cultivate' }"
                >{{ kindLabel(selected) }}</span>
                <span
                  v-if="selected.star"
                  class="detail-star"
                >{{ starText(selected) }}</span>
                <span
                  v-if="selected.scene_type"
                  class="detail-scene"
                >场景：{{ selected.scene_type }}</span>
              </div>
              <div class="detail-desc">{{ selected.description }}</div>
              <div
                v-if="selected.status === 'entered'"
                class="detail-status"
              >⏳ 探索中 — 可继续推进或放弃（放弃将结束该秘境）</div>
              <div class="detail-time">发现于 {{ new Date(selected.created_at).toLocaleString() }}</div>
            </div>
            <div class="detail-actions">
              <button
                class="detail-btn detail-back"
                type="button"
                @click="selected = null"
              >返回列表</button>
              <button
                class="detail-btn detail-abandon"
                type="button"
                :disabled="abandoning"
                @click="onAbandon"
              >{{ abandoning ? '处理中...' : '放弃' }}</button>
              <button
                class="detail-btn detail-enter"
                type="button"
                @click="onEnter"
              >{{ selected.status === 'entered' ? '继续探索' : '进入' }}</button>
            </div>
          </div>
        </div>
      </Teleport>
    </div>
  </Teleport>
</template>

<style scoped>
/* 浮动面板：绝对定位左上角，暗金风格与 NpcShopPanel 一致 */
.adv-panel {
  position: fixed;
  left: 40px;
  top: 40px;
  width: 420px;
  max-height: 78vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.97), rgba(14, 11, 8, 0.98));
  border: 1px solid rgba(180, 150, 90, 0.5);
  border-radius: 10px;
  box-shadow: 0 12px 44px rgba(0, 0, 0, 0.75), inset 0 1px 0 rgba(220, 190, 120, 0.14);
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  overflow: hidden;
}
.adv-panel.is-dragging {
  user-select: none;
}

/* 标题栏 */
.adv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  background: rgba(10, 8, 6, 0.65);
  border-bottom: 1px solid rgba(180, 150, 90, 0.3);
  cursor: grab;
}
.adv-title {
  color: #f0d890;
  font-weight: 700;
  font-size: 1rem;
  letter-spacing: 2px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.adv-close {
  width: 26px;
  height: 26px;
  border: 1px solid rgba(150, 120, 70, 0.4);
  color: rgba(200, 170, 110, 0.6);
  background: none;
  border-radius: 4px;
  font-size: 1.2rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.adv-close:hover {
  color: #ff9080;
  border-color: rgba(255, 120, 100, 0.6);
  background: rgba(60, 20, 15, 0.5);
}

/* 列表区 */
.adv-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
}
.adv-empty {
  padding: 40px 0;
  text-align: center;
  color: rgba(200, 170, 110, 0.5);
  font-size: 0.9rem;
  letter-spacing: 1px;
}
.adv-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* 奇遇卡片 */
.adv-card {
  padding: 12px;
  background: linear-gradient(180deg, rgba(40, 30, 20, 0.6), rgba(24, 18, 12, 0.6));
  border: 1px solid rgba(180, 150, 90, 0.3);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}
.adv-card:hover {
  border-color: rgba(220, 190, 120, 0.7);
  background: linear-gradient(180deg, rgba(55, 42, 26, 0.7), rgba(34, 26, 18, 0.7));
  box-shadow: 0 0 10px rgba(212, 175, 106, 0.15);
}
.adv-card-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.adv-card-title {
  color: #e8d5a0;
  font-weight: 700;
  font-size: 0.95rem;
  letter-spacing: 1px;
}
.adv-card-badge {
  padding: 1px 8px;
  font-size: 0.7rem;
  color: #d4af6a;
  border: 1px solid rgba(180, 150, 90, 0.5);
  border-radius: 3px;
  letter-spacing: 1px;
}
.adv-card-badge.cultivate {
  color: #a0d8a0;
  border-color: rgba(120, 180, 120, 0.5);
}
/* 探索中（entered）卡片：金色描边高亮，提示有进行中的秘境 */
.adv-card.is-entered {
  border-color: rgba(240, 216, 144, 0.7);
  box-shadow: 0 0 12px rgba(240, 216, 144, 0.2);
  background: linear-gradient(180deg, rgba(60, 48, 28, 0.7), rgba(38, 28, 18, 0.7));
}
.adv-card-status {
  padding: 1px 8px;
  font-size: 0.68rem;
  color: #f0d890;
  background: rgba(240, 216, 144, 0.12);
  border: 1px solid rgba(240, 216, 144, 0.5);
  border-radius: 3px;
  letter-spacing: 1px;
}
.adv-card-desc {
  font-size: 0.82rem;
  color: rgba(220, 210, 180, 0.8);
  line-height: 1.6;
}
.adv-card-star {
  margin-top: 6px;
  color: #f0d890;
  font-size: 0.85rem;
  letter-spacing: 2px;
}

/* 详情子弹层 */
.detail-overlay {
  position: fixed;
  inset: 0;
  background: rgba(5, 5, 12, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}
.detail-box {
  width: 460px;
  max-width: 90vw;
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.98), rgba(14, 11, 8, 0.99));
  border: 1px solid rgba(180, 150, 90, 0.5);
  border-radius: 10px;
  box-shadow: 0 16px 50px rgba(0, 0, 0, 0.8);
  color: #e8e2d0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  overflow: hidden;
}
.detail-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 18px;
  background: rgba(10, 8, 6, 0.7);
  border-bottom: 1px solid rgba(180, 150, 90, 0.3);
}
.detail-title {
  color: #f0d890;
  font-weight: 700;
  font-size: 1.1rem;
  letter-spacing: 2px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.detail-body {
  padding: 18px;
}
.detail-meta {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 14px;
}
.detail-star {
  color: #f0d890;
  font-size: 1rem;
  letter-spacing: 2px;
}
.detail-scene {
  color: rgba(200, 170, 110, 0.7);
  font-size: 0.85rem;
}
.detail-desc {
  font-size: 0.92rem;
  color: rgba(230, 222, 208, 0.92);
  line-height: 1.8;
  letter-spacing: 0.5px;
  padding: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-left: 2px solid rgba(180, 150, 90, 0.5);
  border-radius: 3px;
}
.detail-time {
  margin-top: 10px;
  font-size: 0.75rem;
  color: rgba(200, 170, 110, 0.5);
  text-align: right;
}
.detail-status {
  margin-top: 10px;
  padding: 6px 10px;
  font-size: 0.8rem;
  color: #f0d890;
  background: rgba(240, 216, 144, 0.08);
  border-radius: 3px;
}
.detail-actions {
  display: flex;
  gap: 10px;
  padding: 14px 18px;
  border-top: 1px solid rgba(180, 150, 90, 0.2);
}
.detail-btn {
  flex: 1;
  padding: 8px 0;
  background: linear-gradient(180deg, rgba(55, 42, 24, 0.85), rgba(38, 28, 18, 0.85));
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 4px;
  color: #e8d5a0;
  font-size: 0.85rem;
  letter-spacing: 2px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  cursor: pointer;
  transition: all 0.15s ease;
}
.detail-btn:hover:not(:disabled) {
  border-color: rgba(220, 190, 120, 0.9);
  background: linear-gradient(180deg, rgba(75, 56, 32, 0.95), rgba(50, 38, 25, 0.95));
  box-shadow: 0 0 8px rgba(212, 175, 106, 0.25);
}
.detail-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.detail-abandon {
  color: rgba(255, 160, 140, 0.85);
  border-color: rgba(180, 100, 80, 0.4);
}
.detail-enter {
  color: #f0d890;
  border-color: rgba(220, 190, 120, 0.6);
}

/* 滚动条 */
.adv-body::-webkit-scrollbar {
  width: 6px;
}
.adv-body::-webkit-scrollbar-thumb {
  background: rgba(180, 150, 90, 0.3);
  border-radius: 3px;
}
.adv-body::-webkit-scrollbar-track {
  background: transparent;
}
</style>
