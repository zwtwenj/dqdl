<script setup>
import { ref, computed, onMounted } from 'vue'
import playerBox from '@/components1/playerBox.vue'
import quickButton from '@/components1/quickButton.vue'
import ProgressBar from '@/components1/progressBar.vue'
import { usePlayerStore } from '@/stores/player'
import { bus, BusEvents } from '@/utils/eventBus'
import { getCurrentCultivation } from '@/api'

const playerStore = usePlayerStore()
const player = computed(() => playerStore.player)
const loading = computed(() => playerStore.loading)

const emits = defineEmits(['openContainer'])

// 玩家是否移动中（status=9）/ 历练中（status=2）/ 秘境中（status=3）/ 修炼中（status=4,5）/ 战斗中（active_status=7）
const isMoving = computed(() => player.value?.status === 9)
const isTraining = computed(() => player.value?.status === 2)
const isDungeon = computed(() => player.value?.status === 3)
const isCultivating = computed(() => player.value?.status === 4 || player.value?.status === 5)
// 战斗中：active_status=7（新逻辑）；兼容旧数据 status=7（旧逻辑 setStatus 直设）
const isInBattle = computed(() => player.value?.active_status === 7 || player.value?.status === 7)

/** 状态栏显示：有叠加状态（战斗中）优先显示 active_status_label，否则显示 status_label */
const displayLabel = computed(
  () => player.value?.active_status_label || player.value?.status_label || '未知',
)

async function onStatusClick() {
  // 只按 status 判断（战斗中 status 恒为来源=秘境中，开副本弹窗；副本弹窗自检测 active_status 拉战斗）
  if (isMoving.value) bus.emit(BusEvents.MOVE_DIALOG_OPEN)
  else if (isTraining.value) bus.emit(BusEvents.TRAINING_DIALOG_OPEN)
  else if (isDungeon.value) {
    // 秘境中/战斗中：重新打开秘境面板（不带 encounterId，恢复现有秘境 + 战斗）
    bus.emit(BusEvents.DUNGEON_OPEN)
  }
  else if (isCultivating.value) {
    // 查当前进行中的修炼会话，拿到 encounter_id 打开洞天福地详情
    try {
      const session = await getCurrentCultivation()
      if (session?.encounter_id) {
        bus.emit(BusEvents.CULTIVATION_DETAIL_OPEN, { encounterId: session.encounter_id })
      }
    } catch { /* 静默 */ }
  }
}

/** 进度百分比：cur/max → 0~100，max 为 0 时返回 0（防除零） */
function pct(cur, max) {
  const c = Number(cur) || 0
  const m = Number(max) || 0
  if (m <= 0) return 0
  return Math.max(0, Math.min(100, (c / m) * 100))
}

// 三条进度条宽度（maxHp/maxEnergy 来自 store，含功法+宝物加成）
const maxHp = computed(() => playerStore.maxHp)
const maxEnergy = computed(() => playerStore.maxEnergy)

const hpPct = computed(() => pct(player.value?.hp, maxHp.value))
const energyPct = computed(() => pct(player.value?.energy, maxEnergy.value))
const cultPct = computed(() => pct(player.value?.cultivation, player.value?.level_cultivation))

onMounted(() => playerStore.load())

// —— 进度条 tooltip 文案（每条一个，供 v-tooltip 直接绑定）——
const cultTip = computed(() => {
  const p = player.value || {}
  return `当前修为：${p.cultivation ?? 0} / ${p.level_cultivation ?? 0}`
})
const hpTip = computed(() => {
  const p = player.value || {}
  return `当前气血：${p.hp ?? 0} / ${maxHp.value}`
})
const energyTip = computed(() => {
  const p = player.value || {}
  return `当前斗气：${p.energy ?? 0} / ${maxEnergy.value}`
})


// 打开背包
const openContainer = (tab) => {
    emits('openContainer', tab)
}

// 打开任务列表弹窗（事件总线驱动）
function onTaskClick() {
    const pid = player.value?.id
    if (!pid) return
    bus.emit(BusEvents.TASK_LIST_OPEN, { playerId: pid })
}
</script>

<template>
    <playerBox class="game-view-player-info">
        <div class="player-info-avatar">
            <img src="/ui/boy.png" class="player-avatar">
            <div class="player-name-level">
                <div class="player-name">
                    {{ player?.name || (loading ? '...' : '???') }}
                </div>
                <div class="player-level">
                    {{ player?.level_name || (loading ? '...' : '---') }}
                </div>
            </div>
        </div>
        <div class="quick-botton-list">
            <quickButton class="quick-button" @click="onTaskClick">任务</quickButton>
            <quickButton class="quick-button" @click="openContainer('player')">人物</quickButton>
            <quickButton class="quick-button" @click="openContainer('backpack')">背包</quickButton>
            <quickButton class="quick-button" @click="openContainer('skill')">斗技</quickButton>
        </div>
        <div class="player-hp-mp-cult" v-if="player">
            <div class="player-cult">
                <div class="player-cult-left">修为：</div>
                <ProgressBar type="cult" :pct="cultPct" :tip="cultTip" />
            </div>
            <div class="player-hp">
                <div class="player-hp-left">气血：</div>
                <ProgressBar type="hp" :pct="hpPct" :tip="hpTip" />
            </div>
            <div class="player-energy">
                <div class="player-energy-left">斗气：</div>
                <ProgressBar type="energy" :pct="energyPct" :tip="energyTip" />
            </div>
        </div>
        <div class="player-status">
            <div class="player-status-left">状态：</div>
            <div
                class="player-status-value"
                :class="{
                    'player-status-active': isMoving || isTraining || isDungeon || isCultivating || isInBattle,
                    'player-status-1': !isMoving && !isTraining && !isDungeon && !isCultivating && !isInBattle
                }"
                @click="onStatusClick"
            >{{ loading ? '...' : (displayLabel || '---') }}</div>
        </div>
        <div class="player-money">
            <div class="player-money-left">金钱：</div>
            <div class="player-money-value">{{ player?.money ?? 0 }}</div>
        </div>

    </playerBox >
</template>

<style lang="less" scoped>
.game-view-player-info{
    width: 217px;
}
.player-info-avatar{
    background: #d6cbc5 url("/static/avatar-bg.gif");
    background-position: center center;
    background-size: 100% 100%;
    width: 184px;
    height: 216px;
    padding: 6px;
    /* 截断 .player-avatar 竖向溢出的部分 */
    overflow: hidden;
    margin-bottom: 5px;
}
.player-avatar{
    /* 172×172 方框：图片缩放填满、保持比例，顶部对齐，下方多出裁切 */
    display: block;
    width: 172px;
    height: 172px;
    object-fit: cover;
    object-position: center top;
}
.player-name-level{
    padding: 4px;
    display: flex;
    justify-content: space-between;
    .player-name{
        font-size: var(--fs-lg);
        text-decoration: underline;
        cursor: pointer;
    }
    .player-name:hover{
        color: var(--danger);
    }
    .player-level{
        font-size: var(--fs-lg);
    }
}
.quick-botton-list{
    display: flex;
    gap: 5px;
    margin-bottom: 5px;
    .quick-button{
        flex: 1;
    }
}
.player-hp-mp-cult{
    .player-cult-left, .player-hp-left, .player-energy-left{
        width: 40px;
        font-size: var(--fs-sm);
        line-height: 20px;
    }
    .player-cult, .player-hp, .player-energy{
        display: flex;
        align-items: center;
        margin-bottom: 2px;
    }
    /* ProgressBar 组件在 flex 中撑满剩余宽度 */
    :deep(.progress-point-bg){
        flex: 1;
    }
}
.player-status{
    display: flex;
    align-items: center;
    .player-status-left{
        width: 40px;
        font-size: var(--fs-sm);
        line-height: 20px;
    }
    .player-status-value{
        font-size: var(--fs-sm);
        line-height: 20px;
    }
    .player-status-1{
        color: var(--status-ok);
    }
    /* 移动中/历练中：可点击，下划线提示 */
    .player-status-active{
        color: var(--accent);
        text-decoration: underline;
        cursor: pointer;
    }
}
.player-money{
    display: flex;
    align-items: center;
    .player-money-left{
        width: 40px;
        font-size: var(--fs-sm);
        line-height: 20px;
    }
    .player-money-value{
        font-size: var(--fs-sm);
        line-height: 20px;
        border: 1px solid var(--panel-bg);
        flex: 1;
        background: var(--input-bg);
        padding: 0 5px;
    }
}

/* tooltip 由全局 v-tooltip 指令 + .v-tooltip 样式处理，本组件无需额外样式 */
</style>
