<template>
  <div class="role-overlay" @click.self="emit('close')">
    <div class="role-panel treasure-panel">
      <div class="role-header">
        <span class="role-title">宝物</span>
        <button class="role-close" @click="emit('close')">&times;</button>
      </div>
      <div class="tr-body">
        <div class="tr-tip">在背包中「使用」宝物即可装备到此处；悬浮可查看效果，卸下后会以物品形态返回背包。</div>
        <div class="tr-slots">
          <div
            v-for="slot in 5"
            :key="slot"
            class="tr-slot"
            :class="{ occupied: slotTreasure(slot) }"
            @mouseenter="slotTreasure(slot) && showTip(slotTreasure(slot), $event)"
            @mouseleave="hideTip"
          >
            <template v-if="slotTreasure(slot)">
              <div class="tr-icon">
                <img v-if="isImg(slotTreasure(slot).icon)" :src="slotTreasure(slot).icon" :alt="slotTreasure(slot).name" class="tr-img">
                <template v-else>{{ slotTreasure(slot).name?.[0] || '宝' }}</template>
              </div>
              <div class="tr-name">{{ slotTreasure(slot).name }}</div>
              <div class="tr-stat">{{ bonusSummary(slotTreasure(slot)) }}</div>
              <button class="tr-unequip" :disabled="busy" @click="unequip(slot)">卸下</button>
            </template>
            <template v-else>
              <div class="tr-empty">{{ slot }}</div>
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- 悬浮提示（Teleport 脱离裁切，复用全局 .item-tip） -->
    <Teleport to="body">
      <div v-if="tip" ref="tipEl" class="item-tip treasure-tip" :style="tip.pos">
        <div class="tooltip-name">
          {{ tip.t.name }}
          <span class="tt-rank">{{ rankLabel(tip.t.rank) }}</span>
        </div>
        <div class="tooltip-desc" v-if="tip.t.description">{{ tip.t.description }}</div>
        <div class="tr-tip-line">
          <span class="tr-tip-label">属性加成</span>
          <span class="tr-tip-val">{{ statText(tip.t.stats) || '无' }}</span>
        </div>
        <div class="tr-tip-line">
          <span class="tr-tip-label">特殊效果</span>
          <span class="tr-tip-val">{{ effectText(tip.t.effects) || '无' }}</span>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../stores/player'
import { unequipTreasure as apiUnequip } from '../api'
import { Message } from '../utils/message'

const emit = defineEmits(['close'])
const playerStore = usePlayerStore()
const { data: player } = storeToRefs(playerStore)

const busy = ref(false)
const treasures = computed(() => player.value?.treasures || [])
function slotTreasure(slot) {
  return treasures.value.find((t) => Number(t.slot) === slot) || null
}
// icon 是否为图片地址
function isImg(icon) {
  if (!icon) return false
  return icon.startsWith('/') || /^https?:\/\//.test(icon) || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(icon)
}

const ATTR_LABEL = { power: '力量', intelligence: '智力', quick: '敏捷', stamina: '体质', lucky: '运气', hp: '生命', energy: '斗气' }
// 特殊效果：键 → 标签 / 单位（cultivation_efficiency 值为百分点，显示 +X%）
const EFFECT_LABEL = { cultivation_efficiency: '修炼效率' }
const EFFECT_UNIT = { cultivation_efficiency: '%' }
function statText(stats) {
  if (!stats) return ''
  return Object.keys(stats).filter((k) => stats[k]).map((k) => `${ATTR_LABEL[k] || k}+${stats[k]}`).join(' ')
}
function effectText(effects) {
  if (!effects) return ''
  return Object.keys(effects).filter((k) => effects[k]).map((k) => `${EFFECT_LABEL[k] || k}+${effects[k]}${EFFECT_UNIT[k] || ''}`).join(' ')
}
/** 槽位上的简短加成汇总（属性 + 特殊效果） */
function bonusSummary(t) {
  return [statText(t.stats), effectText(t.effects)].filter(Boolean).join(' ') || '无加成'
}

function rankLabel(rank) {
  if (!rank) return ''
  const tt = ['天阶', '地阶', '玄阶', '黄阶'], g = ['上品', '中品', '下品']
  return (tt[Math.floor(rank / 10)] || '') + (g[rank % 10] || '')
}

// ── 悬浮提示（measure → flip → shift，与斗技/功法提示一致）──
const tip = ref(null)
const tipEl = ref(null)
function showTip(t, e) {
  const r = e.currentTarget.getBoundingClientRect()
  tip.value = { t, pos: { left: '-9999px', top: '-9999px', width: '230px', visibility: 'hidden' } }
  nextTick(() => {
    const el = tipEl.value
    if (!el) return
    const M = 8
    const w = el.offsetWidth || 230
    const h = el.offsetHeight || 100
    let left = r.left + r.width / 2 - w / 2
    left = Math.max(M, Math.min(window.innerWidth - w - M, left))
    let top = r.bottom + M
    if (top + h > window.innerHeight - M) {
      const above = r.top - M - h
      top = above >= M ? above : Math.max(M, window.innerHeight - h - M)
    }
    tip.value = { ...tip.value, pos: { left: left + 'px', top: top + 'px', width: w + 'px' } }
  })
}
function hideTip() { tip.value = null }

async function unequip(slot) {
  if (busy.value) return
  busy.value = true
  try {
    const res = await apiUnequip(playerStore.playerId, slot)
    if (res.data) playerStore.data = res.data
    Message.success('已卸下宝物')
  } catch (e) {
    Message.error(e.response?.data?.message || '卸下失败')
  } finally {
    busy.value = false
  }
}
</script>

<style scoped>
.treasure-panel { width: 620px; max-width: 96vw; max-height: 86vh; display: flex; flex-direction: column; }
.tr-body { padding: 16px 18px; overflow-y: auto; }
.tr-tip { font-size: 0.78rem; color: #8a8a9a; margin-bottom: 14px; }
.tr-slots { display: grid; grid-template-columns: repeat(5, 1fr); gap: 10px; }
.tr-slot {
  display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px;
  min-height: 160px; padding: 10px 6px;
  background: var(--bg-elev-2); border: 1px solid var(--border); border-radius: var(--radius);
  position: relative;
}
.tr-slot.occupied { border-color: rgba(240, 192, 64, 0.4); }
.tr-icon { font-size: 2rem; line-height: 1; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); }
.tr-img { width: 2.4rem; height: 2.4rem; object-fit: contain; filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5)); pointer-events: none; }
.tr-name { font-size: 0.78rem; color: #e0d8c0; text-align: center; }
.tr-stat { font-size: 0.68rem; color: #6fbfa8; text-align: center; }
.tr-unequip {
  margin-top: 4px; padding: 2px 10px; font-size: 0.72rem; cursor: pointer;
  color: #e08060; background: rgba(70, 40, 36, 0.4); border: 1px solid #5a2e28; border-radius: var(--radius-pill);
}
.tr-unequip:not(:disabled):hover { filter: brightness(1.15); }
.tr-unequip:disabled { opacity: 0.4; cursor: not-allowed; }
.tr-empty { font-size: 1.6rem; color: #3a3a4a; }

/* 悬浮提示内部样式 */
.treasure-tip { max-height: 80vh; overflow-y: auto; }
.tt-rank { font-size: 0.72rem; color: #c0a060; margin-left: 6px; font-weight: normal; }
.tr-tip-line { display: flex; gap: 8px; margin-top: 5px; font-size: 0.78rem; line-height: 1.5; }
.tr-tip-label { color: #8a8a9a; flex-shrink: 0; }
.tr-tip-val { color: #6fbfa8; }
</style>
