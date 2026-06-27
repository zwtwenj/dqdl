<template>
  <div class="role-overlay" @click.self="emit('close')">
    <div class="role-panel treasure-panel">
      <div class="role-header">
        <span class="role-title">宝物</span>
        <button class="role-close" @click="emit('close')">&times;</button>
      </div>
      <div class="tr-body">
        <div class="tr-tip">在背包中「使用」宝物即可装备到此处；卸下后会以物品形态返回背包。</div>
        <div class="tr-slots">
          <div v-for="slot in 5" :key="slot" class="tr-slot" :class="{ occupied: slotTreasure(slot) }">
            <template v-if="slotTreasure(slot)">
              <div class="tr-icon">{{ slotTreasure(slot).name?.[0] || '宝' }}</div>
              <div class="tr-name">{{ slotTreasure(slot).name }}</div>
              <div class="tr-stat">{{ statSummary(slotTreasure(slot).stats) }}</div>
              <button class="tr-unequip" :disabled="busy" @click="unequip(slot)">卸下</button>
            </template>
            <template v-else>
              <div class="tr-empty">{{ slot }}</div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
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
const ATTR_LABEL = { power: '力量', intelligence: '智力', quick: '敏捷', stamina: '体质', lucky: '运气', hp: '生命', energy: '斗气' }
function statSummary(stats) {
  if (!stats) return ''
  return Object.keys(stats)
    .filter((k) => stats[k])
    .map((k) => `${ATTR_LABEL[k] || k}+${stats[k]}`)
    .join(' ') || '无加成'
}

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
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  min-height: 150px; padding: 10px 6px;
  background: var(--bg-elev-2); border: 1px solid var(--border); border-radius: var(--radius);
  position: relative;
}
.tr-slot.occupied { border-color: rgba(240,192,64,0.4); }
.tr-icon { font-size: 2rem; line-height: 1; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.5)); }
.tr-name { font-size: 0.78rem; color: #e0d8c0; text-align: center; }
.tr-stat { font-size: 0.68rem; color: #6fbfa8; text-align: center; }
.tr-unequip {
  margin-top: 4px; padding: 2px 10px; font-size: 0.72rem; cursor: pointer;
  color: #e08060; background: rgba(70,40,36,0.4); border: 1px solid #5a2e28; border-radius: var(--radius-pill);
}
.tr-unequip:not(:disabled):hover { filter: brightness(1.15); }
.tr-unequip:disabled { opacity: 0.4; cursor: not-allowed; }
.tr-empty { font-size: 1.6rem; color: #3a3a4a; }
</style>
