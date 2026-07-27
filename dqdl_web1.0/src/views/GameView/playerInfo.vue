<script setup>
import { ref, computed, onMounted } from 'vue'
import playerBox from '@/components1/playerBox.vue'
import quickButton from '@/components1/quickButton.vue'
import FloatingTooltip from '@/components/FloatingTooltip.vue'
import { usePlayerStore } from '@/stores/player'
import { bus, BusEvents } from '@/utils/eventBus'

const playerStore = usePlayerStore()
const player = computed(() => playerStore.player)
const loading = computed(() => playerStore.loading)

// 玩家是否移动中（status=9）：此时状态栏可点击，重新打开移动弹窗
const isMoving = computed(() => player.value?.status === 9)

function onStatusClick() {
  if (isMoving.value) bus.emit(BusEvents.MOVE_DIALOG_OPEN)
}

/** 进度百分比：cur/max → 0~100，max 为 0 时返回 0（防除零） */
function pct(cur, max) {
  const c = Number(cur) || 0
  const m = Number(max) || 0
  if (m <= 0) return 0
  return Math.max(0, Math.min(100, (c / m) * 100))
}

// 三条进度条宽度（绑定到 :style）
// 注意：气血/斗气上限必须用 final_attrs 里的值（含功法+宝物加成），
// 顶层 max_hp/max_energy 只是基础值（stamina*10 / level*20），不含加成，
// 用错会出现 hp > max_hp 的倒挂（如 370/270）。
const finalAttrs = computed(() => player.value?.final_attrs || {})
const maxHp = computed(() => finalAttrs.value.max_hp ?? player.value?.max_hp ?? 0)
const maxEnergy = computed(() => finalAttrs.value.max_energy ?? player.value?.max_energy ?? 0)

const hpPct = computed(() => pct(player.value?.hp, maxHp.value))
const energyPct = computed(() => pct(player.value?.energy, maxEnergy.value))
const cultPct = computed(() => pct(player.value?.cultivation, player.value?.level_cultivation))

onMounted(() => playerStore.load())

// —— 进度条 tooltip（三条共用一个 FloatingTooltip）——
// tipKey 标记当前悬停的是哪条；hoveredEl 传给 FloatingTooltip 做定位参考
const tipOpen = ref(false)
const tipKey = ref('')                 // 'cult' | 'hp' | 'energy'
const hoveredEl = ref(null)

// 各条 tooltip 文案
const tipText = computed(() => {
  const p = player.value || {}
  if (tipKey.value === 'cult') return `当前修为：${p.cultivation ?? 0} / ${p.level_cultivation ?? 0}`
  if (tipKey.value === 'hp') return `当前气血：${p.hp ?? 0} / ${maxHp.value}`
  if (tipKey.value === 'energy') return `当前斗气：${p.energy ?? 0} / ${maxEnergy.value}`
  return ''
})

function onBarEnter(key, e) {
  tipKey.value = key
  hoveredEl.value = e.currentTarget
  tipOpen.value = true
}
function onBarLeave() {
  tipOpen.value = false
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
            <quickButton class="quick-button">任务</quickButton>
            <quickButton class="quick-button">人物</quickButton>
            <quickButton class="quick-button">背包</quickButton>
            <quickButton class="quick-button">斗技</quickButton>
        </div>
        <div class="player-hp-mp-cult" v-if="player">
            <div class="player-cult">
                <div class="player-cult-left">修为：</div>
                <div class="player-cult-point-bg"
                    @pointerenter="onBarEnter('cult', $event)"
                    @pointerleave="onBarLeave">
                    <div class="player-cult-point" :style="{ width: cultPct + '%' }"></div>
                </div>
            </div>
            <div class="player-hp">
                <div class="player-hp-left">气血：</div>
                <div class="player-hp-point-bg"
                    @pointerenter="onBarEnter('hp', $event)"
                    @pointerleave="onBarLeave">
                    <div class="player-hp-point" :style="{ width: hpPct + '%' }"></div>
                </div>
            </div>
            <div class="player-energy">
                <div class="player-energy-left">斗气：</div>
                <div class="player-energy-point-bg"
                    @pointerenter="onBarEnter('energy', $event)"
                    @pointerleave="onBarLeave">
                    <div class="player-energy-point" :style="{ width: energyPct + '%' }"></div>
                </div>
            </div>
        </div>
        <div class="player-status">
            <div class="player-status-left">状态：</div>
            <div
                class="player-status-value"
                :class="{ 'player-status-moving': isMoving, 'player-status-1': !isMoving }"
                @click="onStatusClick"
            >{{ player?.status_label || (loading ? '...' : '---') }}</div>
        </div>
        <div class="player-money">
            <div class="player-money-left">金钱：</div>
            <div class="player-money-value">{{ player?.money ?? 0 }}</div>
        </div>

        <!-- 进度条 tooltip：三条共用一个浮层，外壳样式覆盖为 titlebox 风格 -->
        <FloatingTooltip
            v-model:open="tipOpen"
            :reference="hoveredEl"
            placement="top"
            skin-class="titlebox-skin"
        >
            <span class="titlebox-span">{{ tipText }}</span><br />
        </FloatingTooltip>
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
    }
    .player-cult-point-bg, .player-hp-point-bg, .player-energy-point-bg{
        flex: 1;
        background: url("/static/point-bar-bg.gif") no-repeat;
        background-size: 100% 100%;
        height: 14px;
        padding: 3px;
        /* 进度槽：裁切子元素，让填充从左往右按百分比露出 */
        overflow: hidden;
        .player-cult-point{
            /* width 用百分比控制进度；
               高度填满槽体；背景图用满条宽度的固定尺寸，绝不被压缩，
               超出父元素的部分由 overflow:hidden 截断 */
            height: 100%;
            background: url("/static/point-bar-1.gif") no-repeat;
            background-size: 137px 100%;   /* 固定宽度=满条宽，高度填满 */
            background-position: left center;
        }
        .player-hp-point{
            height: 100%;
            background: url("/static/point-bar-2.gif") no-repeat;
            background-size: 137px 100%;   /* 固定宽度=满条宽，高度填满 */
            background-position: left center;
        }
        .player-energy-point{
            height: 100%;
            background: url("/static/point-bar-3.gif") no-repeat;
            background-size: 137px 100%;   /* 固定宽度=满条宽，高度填满 */
            background-position: left center;
        }
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
    /* 移动中：可点击，下划线提示 */
    .player-status-moving{
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

/* —— 进度条 tooltip：浮层外壳样式（.ft-floating 由 FloatingTooltip Teleport 到 body，
   scoped 的 :deep 无法穿透 Teleport，故用 skinClass 传入 + 非 scoped 样式块覆盖）—— */
.titlebox-span{
    color: var(--tooltip-border);
}
</style>

<!-- 非 scoped：通过 skinClass 覆盖 FloatingTooltip 浮层外壳为 titlebox 风格 -->
<style lang="less">
.titlebox-skin{
    width: auto !important;
    padding: 3px 8px 2px 8px !important;
    background: var(--tooltip-bg) !important;
    border: 1px solid var(--tooltip-border) !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    font-family: inherit !important;
    text-align: center;
}
</style>
