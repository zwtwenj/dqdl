<script setup>
/**
 * 秘境面板（浮动浮窗，暗金 RPG 风格）。
 *
 * 原子化触发：bus.on(DUNGEON_OPEN, {encounterId?}) 打开。
 * 打开时先 getCurrentDungeon()，有则续上（刷新恢复），无则 enterDungeon(encounterId) 生成新的。
 * 展示五幕进度（当前幕高亮）+ 当前幕叙事 + 按 type 的操作按钮。
 *
 * 本次第一期（编排闭环）：
 *   - combat/boss 幕：点「战斗」暂置灰（toast 开发中）
 *   - item 幕：点「拾取」暂置灰，但展示 reveal 文案；配「前进」
 *   - sneak/modifier/explore 幕：纯叙事 + 「前进」
 *   - 最后一幕：「通关结算」
 *   - 随时可「撤退」
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { bus, BusEvents } from '../utils/eventBus'
import {
  enterDungeon, getCurrentDungeon, nextDungeonAct, escapeDungeon,
  winDungeonAct, failDungeon,
} from '../api'
import { startBattle, battleAction, fleeBattle } from '../api'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'
import BattlePanel from './BattlePanel.vue'

const { z, focus, mount, unmount } = usePanelStack('dungeon')

const open = ref(false)
const loading = ref(false)
const acting = ref(false) // 推进/撤退中（防抖）
const instance = ref(null) // 秘境实例
const errorMsg = ref('')

/* ============ 战斗（复用全局 BattlePanel） ============ */
const battleOpen = ref(false)
const battleSnapshot = ref(null)
const battleBusy = ref(false)

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

/** 当前幕对象（acts 按 index 1-based，current_act 同步） */
const currentAct = computed(() => {
  if (!instance.value || !Array.isArray(instance.value.acts)) return null
  return instance.value.acts.find((a) => a.index === instance.value.current_act) || null
})

/** 是否在最后一幕 */
const isLastAct = computed(() => {
  if (!instance.value) return false
  const total = Array.isArray(instance.value.acts) ? instance.value.acts.length : 5
  return instance.value.current_act >= total
})

/** 是否已通关/撤退（非 active） */
const isFinished = computed(() => instance.value && instance.value.status !== 'active')

/** 打开面板 */
async function handleOpen({ encounterId } = {}) {
  open.value = true
  focus()
  errorMsg.value = ''
  await loadOrEnter(encounterId)
}

/**
 * 加载或生成秘境。
 * - 带 encounterId（从奇遇列表点「进入」）：直接生成新秘境（后端 enter 会把旧 active 标记为 escaped）
 * - 不带 encounterId（恢复/重复打开）：有记录则展示（不重复生成），无记录才生成新的
 */
async function loadOrEnter(encounterId) {
  loading.value = true
  try {
    if (encounterId) {
      // 明确指定进入某个奇遇 → 生成新秘境
      const inst = await enterDungeon(encounterId)
      instance.value = inst
      bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
      return
    }
    // 无指定 → 恢复现有或新建
    const cur = await getCurrentDungeon()
    if (cur) {
      instance.value = cur
      if (cur.status !== 'active') {
        bus.emit(BusEvents.TOAST, {
          type: 'info',
          message: cur.status === 'completed' ? '该秘境已通关' : '该秘境已结束',
        })
      }
      return
    }
    // 无任何记录 → 直接生成（无奇遇来源，随机场景）
    const inst = await enterDungeon(undefined)
    instance.value = inst
    bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
  } catch (e) {
    errorMsg.value = e.message || '进入秘境失败'
    bus.emit(BusEvents.TOAST, { type: 'error', message: errorMsg.value })
  } finally {
    loading.value = false
  }
}

/** 推进下一幕 / 通关结算（combat/boss 幕须先击败才能推进） */
async function onNext() {
  if (acting.value || !instance.value) return
  // 前置校验：当前是战斗幕且未击败 → 拦截
  const act = currentAct.value
  if (act && (act.type === 'combat' || act.type === 'boss') && !act.cleared) {
    bus.emit(BusEvents.TOAST, { type: 'info', message: '须先击败当前魔兽才能继续' })
    return
  }
  acting.value = true
  try {
    const inst = await nextDungeonAct()
    instance.value = inst
    if (inst.status === 'completed') {
      bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
      bus.emit(BusEvents.TOAST, { type: 'success', message: `🏆 通关：${inst.title}` })
    }
  } catch (e) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: e.message || '推进失败' })
  } finally {
    acting.value = false
  }
}

/** 撤退 */
async function onEscape() {
  if (acting.value || !instance.value) return
  acting.value = true
  try {
    const inst = await escapeDungeon()
    instance.value = inst
    bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
    bus.emit(BusEvents.TOAST, { type: 'info', message: '已撤退，秘境结束' })
  } catch (e) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: e.message || '撤退失败' })
  } finally {
    acting.value = false
  }
}

/** 点「战斗」：开战（combat/boss 幕），打开战斗弹窗 */
async function onBattle() {
  if (acting.value || battleOpen.value) return
  const mobId = currentAct.value?.mob?.mob_id
  if (!mobId) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: '该幕无魔兽配置' })
    return
  }
  battleBusy.value = true
  battleOpen.value = true
  try {
    battleSnapshot.value = await startBattle(mobId)
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '开战失败' })
    battleOpen.value = false
  } finally {
    battleBusy.value = false
  }
}

/** 战斗内行动（普攻/斗技/逃跑） */
async function onBattleAction(action) {
  if (battleBusy.value || battleSnapshot.value?.over) return
  battleBusy.value = true
  try {
    if (action.type === 'flee') {
      battleSnapshot.value = await fleeBattle()
    } else {
      battleSnapshot.value = await battleAction(action.type, action.slot)
    }
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '行动失败' })
  } finally {
    battleBusy.value = false
  }
}

/**
 * 战斗结束关闭弹窗：按结果处理秘境进度。
 * win  → winDungeonAct（标记幕已击败 + 掉落进临时背包）
 * lose → failDungeon（整个秘境失败）
 * flee → 逃跑不算秘境失败，玩家可再次挑战或撤退
 */
async function onBattleClose() {
  const result = battleSnapshot.value?.winner
  const over = battleSnapshot.value?.over
  battleOpen.value = false
  battleSnapshot.value = null
  if (!over) return // 异常关闭，不动秘境

  acting.value = true
  try {
    if (result === 'player') {
      instance.value = await winDungeonAct()
      bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
      bus.emit(BusEvents.TOAST, { type: 'success', message: '击败魔兽！' })
    } else if (result === 'mob') {
      // 战败 → 整个秘境失败
      instance.value = await failDungeon()
      bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
      bus.emit(BusEvents.TOAST, { type: 'error', message: '战斗失败，秘境结束' })
    }
    // flee：不调 win/fail，玩家留在当前幕可再次挑战
  } catch (err) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: err.message || '结算失败' })
  } finally {
    acting.value = false
  }
}

/** 幕类型标签文案 */
function actTypeLabel(type) {
  const m = {
    combat: '战斗', sneak: '潜行', modifier: '环境',
    explore: '探索', item: '宝物', boss: 'BOSS',
  }
  return m[type] || type
}

function close() {
  open.value = false
}

let offOpen = null
onMounted(() => {
  offOpen = bus.on(BusEvents.DUNGEON_OPEN, handleOpen)
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
      class="dun-panel"
      :class="{ 'is-dragging': dragging }"
      :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto', zIndex: z } : { zIndex: z }"
      @pointerdown="focus"
    >
      <!-- 标题栏（拖拽手柄） -->
      <div
        class="dun-header"
        @pointerdown="onHandlePointerDown"
      >
        <span class="dun-title">🗝️ {{ instance?.title || '秘境' }}</span>
        <button
          class="dun-close"
          type="button"
          @pointerdown.stop
          @click="close"
        >×</button>
      </div>

      <!-- 加载中 -->
      <div
        v-if="loading"
        class="dun-empty"
      >正在探入秘境...</div>

      <!-- 错误 -->
      <div
        v-else-if="errorMsg"
        class="dun-empty"
      >{{ errorMsg }}</div>

      <!-- 主体 -->
      <template v-else-if="instance">
        <!-- 入口叙事 -->
        <div
          v-if="instance.intro"
          class="dun-intro"
        >{{ instance.intro }}</div>

        <!-- 五幕进度条 -->
        <div class="dun-progress">
          <div
            v-for="act in instance.acts"
            :key="act.index"
            class="prog-node"
            :class="{
              active: act.index === instance.current_act,
              done: act.index < instance.current_act || isFinished,
              boss: act.type === 'boss',
            }"
          >
            <span class="prog-idx">{{ act.index }}</span>
            <span class="prog-label">{{ actTypeLabel(act.type) }}</span>
          </div>
        </div>

        <!-- 当前幕叙事 -->
        <div
          v-if="currentAct"
          class="dun-act"
        >
          <div class="act-head">
            <span class="act-badge" :class="{ boss: currentAct.type === 'boss' }">{{ actTypeLabel(currentAct.type) }}</span>
            <span class="act-title">{{ currentAct.title }}</span>
          </div>
          <div class="act-narrative">{{ currentAct.narrative }}</div>
          <!-- item 幕的发现提示 -->
          <div
            v-if="currentAct.reveal"
            class="act-reveal"
          >✦ {{ currentAct.reveal }}</div>
          <!-- combat/boss 幕的魔兽信息 -->
          <div
            v-if="currentAct.mob"
            class="act-mob"
          >遭遇：{{ currentAct.mob.name }}（{{ currentAct.mob.attribute || '?' }}属性·Lv{{ currentAct.mob.level }}）</div>
        </div>

        <!-- 操作按钮 -->
        <div class="dun-actions">
          <template v-if="!isFinished">
            <!-- combat/boss 幕：未击败→战斗按钮，已击败→显示掉落 -->
            <button
              v-if="currentAct && (currentAct.type === 'combat' || currentAct.type === 'boss') && !currentAct.cleared"
              class="dun-btn dun-btn-warn"
              type="button"
              :disabled="acting"
              @click="onBattle"
            >战斗</button>
            <div
              v-else-if="currentAct && currentAct.cleared && currentAct.lootNames?.length"
              class="act-looted"
            >战利品：{{ currentAct.lootNames.join('、') }}</div>
            <button
              class="dun-btn dun-btn-primary"
              type="button"
              :disabled="acting || (currentAct && (currentAct.type === 'combat' || currentAct.type === 'boss') && !currentAct.cleared)"
              :title="(currentAct && (currentAct.type === 'combat' || currentAct.type === 'boss') && !currentAct.cleared) ? '须先击败当前魔兽' : ''"
              @click="onNext"
            >{{ isLastAct ? '通关结算' : '前进' }}</button>
            <button
              class="dun-btn dun-btn-ghost"
              type="button"
              :disabled="acting"
              @click="onEscape"
            >撤退</button>
          </template>
          <template v-else>
            <div class="dun-finished">
              {{ instance.status === 'completed' ? '🏆 已通关' : '已结束' }}
            </div>
            <button
              class="dun-btn dun-btn-primary"
              type="button"
              @click="close"
            >关闭</button>
          </template>
        </div>
      </template>
    </div>

    <!-- 秘境内战斗弹窗（复用全局 BattlePanel，全屏覆盖层） -->
    <BattlePanel
      v-if="battleOpen"
      :snapshot="battleSnapshot"
      :busy="battleBusy"
      @action="onBattleAction"
      @close="onBattleClose"
    />
  </Teleport>
</template>

<style scoped>
/* 浮动面板：暗金风格，与 NpcShopPanel/AdventureListPanel 一致 */
.dun-panel {
  position: fixed;
  left: 40px;
  top: 40px;
  width: 560px;
  max-height: 86vh;
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
.dun-panel.is-dragging { user-select: none; }

.dun-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 11px 16px;
  background: rgba(10, 8, 6, 0.65);
  border-bottom: 1px solid rgba(180, 150, 90, 0.3);
  cursor: grab;
}
.dun-title {
  color: #f0d890;
  font-weight: 700;
  font-size: 1.15rem;
  letter-spacing: 2px;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.dun-close {
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
.dun-close:hover {
  color: #ff9080;
  border-color: rgba(255, 120, 100, 0.6);
  background: rgba(60, 20, 15, 0.5);
}

.dun-empty {
  padding: 50px 0;
  text-align: center;
  color: rgba(200, 170, 110, 0.6);
  font-size: 0.9rem;
  letter-spacing: 1px;
}

.dun-intro {
  padding: 16px 20px;
  font-size: 0.95rem;
  color: rgba(220, 210, 180, 0.85);
  line-height: 1.8;
  border-bottom: 1px solid rgba(180, 150, 90, 0.2);
  background: rgba(0, 0, 0, 0.2);
}

/* 五幕进度条 */
.dun-progress {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 10px;
  gap: 6px;
}
.prog-node {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  opacity: 0.45;
  transition: all 0.2s ease;
}
.prog-node.done { opacity: 0.7; }
.prog-node.active {
  opacity: 1;
  transform: translateY(-2px);
}
.prog-idx {
  width: 22px;
  height: 22px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(180, 150, 90, 0.5);
  border-radius: 50%;
  font-size: 0.75rem;
  color: #d4af6a;
  background: rgba(40, 30, 20, 0.6);
}
.prog-node.active .prog-idx {
  border-color: #f0d890;
  color: #f0d890;
  box-shadow: 0 0 8px rgba(240, 216, 144, 0.5);
  background: rgba(70, 52, 28, 0.8);
}
.prog-node.boss .prog-idx {
  border-color: rgba(255, 120, 100, 0.6);
  color: #ff9080;
}
.prog-label {
  font-size: 0.65rem;
  color: rgba(200, 170, 110, 0.8);
  letter-spacing: 1px;
}
.prog-node.active .prog-label { color: #e8d5a0; }

/* 当前幕叙事 */
.dun-act {
  padding: 16px 20px;
  margin: 0 20px 14px;
  background: linear-gradient(180deg, rgba(40, 30, 20, 0.6), rgba(24, 18, 12, 0.6));
  border: 1px solid rgba(180, 150, 90, 0.3);
  border-radius: 6px;
}
.act-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.act-badge {
  padding: 2px 10px;
  font-size: 0.75rem;
  color: #d4af6a;
  border: 1px solid rgba(180, 150, 90, 0.5);
  border-radius: 3px;
}
.act-badge.boss {
  color: #ff9080;
  border-color: rgba(255, 120, 100, 0.6);
}
.act-title {
  color: #e8d5a0;
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: 1px;
}
.act-narrative {
  font-size: 0.95rem;
  color: rgba(230, 222, 208, 0.9);
  line-height: 1.85;
}
.act-reveal {
  margin-top: 10px;
  padding: 8px 12px;
  font-size: 0.88rem;
  color: #f0d890;
  background: rgba(240, 216, 144, 0.08);
  border-left: 2px solid rgba(240, 216, 144, 0.5);
  border-radius: 2px;
}
.act-mob {
  margin-top: 10px;
  font-size: 0.85rem;
  color: rgba(255, 160, 140, 0.85);
}

/* 操作按钮 */
.dun-actions {
  display: flex;
  gap: 10px;
  padding: 14px 20px;
  border-top: 1px solid rgba(180, 150, 90, 0.2);
}
.dun-btn {
  flex: 1;
  padding: 11px 0;
  background: linear-gradient(180deg, rgba(55, 42, 24, 0.85), rgba(38, 28, 18, 0.85));
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 4px;
  color: #e8d5a0;
  font-size: 0.95rem;
  letter-spacing: 2px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  cursor: pointer;
  transition: all 0.15s ease;
}
.dun-btn:hover:not(:disabled) {
  border-color: rgba(220, 190, 120, 0.9);
  background: linear-gradient(180deg, rgba(75, 56, 32, 0.95), rgba(50, 38, 25, 0.95));
  box-shadow: 0 0 8px rgba(212, 175, 106, 0.25);
}
.dun-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.dun-btn-primary { color: #f0d890; border-color: rgba(220, 190, 120, 0.6); }
.dun-btn-warn { color: rgba(255, 160, 140, 0.85); border-color: rgba(180, 100, 80, 0.4); }
.dun-btn-ghost { color: rgba(200, 170, 110, 0.7); }

.act-looted {
  flex: 1;
  align-self: center;
  font-size: 0.78rem;
  color: #d4af6a;
  letter-spacing: 0.5px;
}

.dun-finished {
  flex: 1;
  align-self: center;
  color: #f0d890;
  font-size: 0.9rem;
  letter-spacing: 2px;
}
</style>
