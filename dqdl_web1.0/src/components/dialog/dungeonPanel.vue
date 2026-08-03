<script setup>
/**
 * 秘境面板（Dlg 弹框形式，App.vue 全局挂载，事件总线驱动显隐）。
 *
 * 触发：bus.on(DUNGEON_OPEN, {encounterId?}) 打开。
 * 打开时先 getCurrentDungeon()，有则续上（刷新恢复），无则 enterDungeon(encounterId) 生成新的。
 * 展示五幕进度（当前幕高亮）+ 当前幕叙事 + 按 type 的操作按钮。
 *
 * 内部 html 结构与旧 DungeonPanel 一致，外层改为 Dlg（适配项目复古背景）。
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import Dlg from '@/components1/dlg.vue'
import { bus, BusEvents } from '@/utils/eventBus'
import { usePlayerStore } from '@/stores/player'
import {
  enterDungeon, getCurrentDungeon, getDungeonByEncounter, nextDungeonAct, escapeDungeon,
  winDungeonAct, failDungeon,
} from '@/api'
import { getBattleState } from '@/api'

const playerStore = usePlayerStore()
import Button from '@/components1/button.vue'

const open = ref(false)
const loading = ref(false)
const acting = ref(false) // 推进/撤退中（防抖）
const instance = ref(null) // 秘境实例
const errorMsg = ref('')

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
  errorMsg.value = ''
  await loadOrEnter(encounterId)
  // 检测是否有进行中的战斗：active_status=7 或 battle_log 有 active（查 getBattleState）
  if (playerStore.player?.active_status === 7) {
    openBattleIfInBattle()
  } else {
    await checkActiveBattle()
  }
}

/** 战斗中：让全局 BattlePanel 还原当前战斗（不带 mobId，BattlePanel 内部查库还原） */
function openBattleIfInBattle() {
  bus.emit(BusEvents.BATTLE_OPEN)
}

/** 无 active_status 标记时，查 battle_log 是否有进行中战斗（后端重启后 active_status 可能不同步） */
async function checkActiveBattle() {
  try {
    const snap = await getBattleState()
    if (snap) openBattleIfInBattle()
  } catch { /* 静默 */ }
}

/**
 * 加载或生成秘境。
 * - 带 encounterId（从奇遇列表点「进入」/「还原」）：优先按 encounter 还原已有秘境；
 *   无则生成新秘境（后端 enter 会把旧 active 标记为 escaped）
 * - 不带 encounterId（状态栏恢复/重复打开）：有记录则展示（不重复生成），无记录才生成新的
 */
async function loadOrEnter(encounterId) {
  loading.value = true
  try {
    if (encounterId) {
      // 优先按 encounter 还原已有秘境（entered 奇遇点进入时）
      const existing = await getDungeonByEncounter(encounterId)
      if (existing) {
        instance.value = existing
        if (existing.status !== 'active') {
          bus.emit(BusEvents.TOAST, {
            type: 'info',
            message: existing.status === 'completed' ? '该秘境已通关' : '该秘境已结束',
          })
        }
        return
      }
      // 无已有秘境 → 生成新秘境
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
/** 点「战斗」：让全局 BattlePanel 开战（传 mobId） */
function onBattle() {
  const mobId = currentAct.value?.mob?.mob_id
  if (!mobId) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: '该幕无魔兽配置' })
    return
  }
  bus.emit(BusEvents.BATTLE_OPEN, { mobId })
}

/**
 * 战斗结束（BATTLE_RESULT 广播）：按结果处理秘境进度。
 * win  → winDungeonAct（标记幕已击败 + 掉落进临时背包）
 * lose → failDungeon（整个秘境失败）
 * flee → 逃跑不算秘境失败，玩家可再次挑战或撤退
 */
async function onBattleResult({ winner: result, over } = {}) {
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

/** 关闭 */
function close() {
  open.value = false
  instance.value = null
  errorMsg.value = ''
}

let offOpen = null
let offBattleResult = null
onMounted(() => {
  offOpen = bus.on(BusEvents.DUNGEON_OPEN, handleOpen)
  // 战斗结束广播 → 秘境结算（win/fail）
  offBattleResult = bus.on(BusEvents.BATTLE_RESULT, onBattleResult)
})
onUnmounted(() => {
  offOpen && offOpen()
  offBattleResult && offBattleResult()
})
</script>

<template>
  <Dlg
    v-if="open"
    :title="'秘境 · ' + (instance?.title || '')"
    :contentStyleProp="{ width: '600px' }"
    @close="close"
  >
    <div class="dun-panel">
      <!-- 加载中 -->
      <div v-if="loading" class="dun-empty">正在探入秘境...</div>

      <!-- 错误 -->
      <div v-else-if="errorMsg" class="dun-empty">{{ errorMsg }}</div>

      <!-- 主体 -->
      <template v-else-if="instance">
        <!-- 入口叙事 -->
        <div v-if="instance.intro" class="dun-intro">{{ instance.intro }}</div>

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
        <div v-if="currentAct" class="dun-act">
          <div class="act-head">
            <span class="act-badge" :class="{ boss: currentAct.type === 'boss' }">{{ actTypeLabel(currentAct.type) }}</span>
            <span class="act-title">{{ currentAct.title }}</span>
          </div>
          <div class="act-narrative">{{ currentAct.narrative }}</div>
          <!-- item 幕的发现提示 -->
          <div v-if="currentAct.reveal" class="act-reveal">✦ {{ currentAct.reveal }}</div>
          <!-- combat/boss 幕的魔兽信息 -->
          <div v-if="currentAct.mob" class="act-mob">遭遇：{{ currentAct.mob.name }}（{{ currentAct.mob.attribute || '?' }}属性·Lv{{ currentAct.mob.level }}）</div>
        </div>

        <!-- 操作按钮 -->
        <div class="dun-actions">
          <template v-if="!isFinished">
            <!-- combat/boss 幕：未击败→战斗按钮，已击败→显示掉落 -->
            <Button
              v-if="currentAct && (currentAct.type === 'combat' || currentAct.type === 'boss') && !currentAct.cleared"
              class="dun-btn dun-btn-warn"
              type="button"
              :disabled="acting"
              @click="onBattle"
            >战斗</Button>
            <div
              v-else-if="currentAct && currentAct.cleared && currentAct.lootNames?.length"
              class="act-looted"
            >战利品：{{ currentAct.lootNames.join('、') }}</div>
            <Button
              class="dun-btn dun-btn-primary"
              type="button"
              :disabled="acting || (currentAct && (currentAct.type === 'combat' || currentAct.type === 'boss') && !currentAct.cleared)"
              :title="(currentAct && (currentAct.type === 'combat' || currentAct.type === 'boss') && !currentAct.cleared) ? '须先击败当前魔兽' : ''"
              @click="onNext"
            >{{ isLastAct ? '通关结算' : '前进' }}</Button>
            <Button
              class="dun-btn dun-btn-ghost"
              type="button"
              :disabled="acting"
              @click="onEscape"
            >撤退</Button>
          </template>
          <template v-else>
            <div class="dun-finished">
              {{ instance.status === 'completed' ? '🏆 已通关' : '已结束' }}
            </div>
            <Button
              class="dun-btn dun-btn-primary"
              type="button"
              @click="close"
            >关闭</Button>
          </template>
        </div>
      </template>
    </div>
  </Dlg>
</template>

<style lang="less" scoped>
.dun-panel{
  text-align: left;
  color: #3a2a1a;
}
.dun-empty{
  text-align: center;
  color: #8a7a60;
  padding: 40px 0;
}
.dun-intro{
  font-size: 13px;
  line-height: 1.8;
  color: #5a4a38;
  padding: 10px 12px;
  background: #fbf9f4;
  border: 1px solid #d8cdb8;
  border-radius: 6px;
  margin-bottom: 12px;
  position: relative;
  &::before{
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    background: #c8a44a;
    border-radius: 2px;
  }
}
.dun-progress{
  display: flex;
  justify-content: space-between;
  gap: 6px;
  margin-bottom: 12px;
  .prog-node{
    flex: 1;
    text-align: center;
    padding: 6px 4px;
    background: #ece8e0;
    border: 1px solid #d8cdb8;
    border-radius: 4px;
    .prog-idx{
      display: block;
      font-size: 14px;
      font-weight: bold;
      color: #8a7a60;
    }
    .prog-label{
      font-size: 11px;
      color: #8a7a60;
    }
    &.active{
      background: #fbf6e8;
      border-color: #c8a44a;
      .prog-idx{ color: #b8860b; }
    }
    &.done{
      background: #f0f7e8;
      border-color: #9cc07a;
      .prog-idx{ color: #7fa860; }
    }
    &.boss .prog-label{ color: #c80000; }
  }
}
.dun-act{
  padding: 10px 12px;
  background: #f6f4ef;
  border: 1px solid #bbb09a;
  border-radius: 6px;
  .act-head{
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 6px;
    .act-badge{
      font-size: 11px;
      color: #fff;
      background: #8a7a60;
      padding: 1px 8px;
      border-radius: 3px;
      &.boss{ background: #c80000; }
    }
    .act-title{
      font-size: 15px;
      font-weight: bold;
      color: #3a2a1a;
    }
  }
  .act-narrative{
    font-size: 13px;
    line-height: 1.8;
    color: #5a4a38;
  }
  .act-reveal{
    margin-top: 8px;
    font-size: 13px;
    color: #b8860b;
  }
  .act-mob{
    margin-top: 8px;
    font-size: 13px;
    color: #c80000;
  }
}
.dun-actions{
  margin-top: 14px;
  display: flex;
  justify-content: center;
  gap: 10px;
  .dun-btn{
    // padding: 6px 20px;
    // border-radius: 4px;
    // cursor: pointer;
    // font-size: 13px;
    // border: 1px solid;
    // &:disabled{ opacity: 0.5; cursor: not-allowed; }
  }
}
</style>
