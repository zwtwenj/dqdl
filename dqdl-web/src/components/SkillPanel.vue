<template>
  <div class="role-overlay" @click.self="emit('close')">
    <div class="role-panel skill-panel" @click.stop>
      <div class="role-header">
        <span class="role-title">斗技</span>
        <button class="role-close" @click="emit('close')">&times;</button>
      </div>
      <div class="skill-body">
        <!-- 装备槽 -->
        <div class="skill-slots">
          <div class="skill-slots-title">已装备（右键卸下，悬浮查看）</div>
          <div class="skill-slots-row">
            <div
              v-for="slot in 5"
              :key="slot"
              class="skill-slot"
              :class="{ occupied: slotSkill(slot) }"
              @dragover.prevent
              @drop="onDropSlot(slot, $event)"
              @contextmenu.prevent="onRightClickSlot(slot)"
              @mouseenter="slotSkill(slot) && showTip(slotSkill(slot), $event)"
              @mouseleave="hideTip"
            >
              <template v-if="slotSkill(slot)">
                <div class="skill-icon">{{ slotSkill(slot).name?.[0] || '技' }}</div>
                <div class="skill-lv">Lv.{{ slotSkill(slot).level }}</div>
              </template>
              <template v-else>
                <div class="skill-slot-empty">{{ slot }}</div>
              </template>
            </div>
          </div>
        </div>

        <!-- 斗技列表 -->
        <div class="skill-inventory">
          <div class="skill-inventory-title">已习得斗技</div>
          <div class="skill-inventory-grid">
            <div
              v-for="s in inventoryList"
              :key="s.id"
              class="skill-item"
              draggable="true"
              title="点击装备到空槽位，或拖拽到指定槽位"
              @click="onEquip(s)"
              @dragstart="onDragStart(s, $event)"
              @mouseenter="showTip(s, $event)"
              @mouseleave="hideTip"
            >
              <div class="skill-icon">{{ s.name?.[0] || '技' }}</div>
              <div class="skill-name">{{ s.name }}</div>
              <div class="skill-lv">Lv.{{ s.level }}</div>
            </div>
            <div v-if="inventoryList.length === 0" class="skill-empty">暂无未装备斗技</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 悬浮提示（数据全部来自后端 join 好的 player.skills[]） -->
    <Teleport to="body">
      <div v-if="tip" ref="tipEl" class="item-tip skill-tip" :style="tip.pos">
        <div class="tooltip-name">
          {{ tip.s.name }}
          <span class="tt-rank">{{ rankLabel(tip.s.rank) }}</span>
          <span class="tt-lv">Lv.{{ tip.s.level }}</span>
        </div>
        <div class="tooltip-desc" v-if="tip.s.description">{{ tip.s.description }}</div>
        <div class="tooltip-desc sk-dmg">
          {{ attrLabel(tip.s.attr) }}属性 · 倍率 ×{{ tip.s.damageRate }} · 基础 {{ tip.s.base_damage || 0 }} · 耗气 {{ tip.s.energy_cost || 0 }}
        </div>
        <template v-for="g in tip.s.groups" :key="g.tag">
          <div class="sk-group" v-if="g.items.length">
            <div class="sk-group-title">{{ g.tag }}</div>
            <div v-for="(it, i) in g.items" :key="i" class="sk-eff">
              <span class="sk-eff-name">{{ it.icon }} {{ it.name }}<span v-if="it.param" class="sk-eff-val"> · {{ it.param }}</span></span>
              <span class="sk-eff-desc" v-if="it.desc">{{ it.desc }}</span>
            </div>
          </div>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../stores/player'
import { updatePlayerSkills } from '../api'
import { Message } from '../utils/message'
import { attrLabels } from '../game/constants'

const emit = defineEmits(['close'])
const playerStore = usePlayerStore()
const { data: player } = storeToRefs(playerStore)

// 斗技数据已由后端 findOne 富化（含伤害公式 + 附带 buff 的名称/描述），前端无需再请求 skill/buff 全量表
const skills = computed(() => player.value?.skills || [])
const equippedMap = computed(() => {
  const map = {}
  skills.value.forEach(s => { if (s.carry >= 1 && s.carry <= 5) map[s.carry] = s })
  return map
})
const inventoryList = computed(() => skills.value.filter(s => !s.carry))
function slotSkill(slot) { return equippedMap.value[slot] || null }

function rankLabel(rank) {
  if (!rank) return ''
  const t = ['天阶', '地阶', '玄阶', '黄阶'], g = ['上品', '中品', '下品']
  return (t[Math.floor(rank / 10)] || '') + (g[rank % 10] || '')
}
function attrLabel(a) { return attrLabels[a] || a }

// ── 悬浮提示（measure → flip → shift）──
const tip = ref(null)
const tipEl = ref(null)
function showTip(s, e) {
  const r = e.currentTarget.getBoundingClientRect()
  tip.value = { s, pos: { left: '-9999px', top: '-9999px', width: '250px', visibility: 'hidden' } }
  nextTick(() => {
    const el = tipEl.value
    if (!el) return
    const M = 8
    const w = el.offsetWidth || 250
    const h = el.offsetHeight || 120
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

// ── 装备/卸下（仅改 carry，本地同步 player.skills[] 与 player.skill 原始串）──
function parseRaw(raw) { try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a : [] } catch { return [] } }

/** 点击装备：装入第一个空槽位（1-5）；无空位则提示。拖拽到指定槽位仍保留。 */
function onEquip(s) {
  const used = new Set(skills.value.filter(x => x.carry >= 1 && x.carry <= 5).map(x => x.carry))
  const free = [1, 2, 3, 4, 5].find(sl => !used.has(sl))
  if (!free) { Message.warning('斗技栏已满（5/5），请先卸下'); return }
  applyCarryChange(raw => {
    const t = raw.find(x => x.id === s.id); if (t) t.carry = free
  })
}
function onDragStart(s, e) {
  e.dataTransfer.setData('text/plain', String(s.id))
  e.dataTransfer.effectAllowed = 'move'
}
function onDropSlot(slot, e) {
  e.preventDefault()
  const id = Number(e.dataTransfer.getData('text/plain'))
  if (!id) return
  applyCarryChange(raw => {
    raw.forEach(x => { if (x.id === id) x.carry = null })
    raw.forEach(x => { if (x.carry === slot) x.carry = null })
    const t = raw.find(x => x.id === id); if (t) t.carry = slot
  })
}
function onRightClickSlot(slot) {
  applyCarryChange(raw => {
    const t = raw.find(x => x.carry === slot); if (t) t.carry = null
  })
}
async function applyCarryChange(mutate) {
  const raw = parseRaw(player.value?.skill)
  mutate(raw)
  // 本地同步富化数组里对应斗技的 carry，避免重新拉取
  const carryById = new Map(raw.map(x => [x.id, x.carry ?? null]))
  const synced = skills.value.map(s => ({ ...s, carry: carryById.has(s.id) ? carryById.get(s.id) : s.carry }))
  playerStore.data = { ...playerStore.data, skill: JSON.stringify(raw), skills: synced }
  try { await updatePlayerSkills(playerStore.playerId, JSON.stringify(raw)) }
  catch (err) { console.error('保存斗技失败', err) }
}
</script>

<style scoped>
.skill-tip { max-height: 80vh; overflow-y: auto; }
.tt-rank { font-size: 0.72rem; color: #c0a060; margin-left: 6px; font-weight: normal; }
.tt-lv { font-size: 0.72rem; color: #7fd09a; margin-left: 6px; font-weight: normal; }
.sk-dmg { color: #c8b078; }
.sk-group { margin-top: 6px; padding-top: 5px; border-top: 1px solid var(--border); }
.sk-group-title { font-size: 0.74rem; color: #b0a878; margin-bottom: 4px; letter-spacing: 0.04em; }
.sk-eff { display: flex; flex-direction: column; margin-bottom: 4px; }
.sk-eff-name { font-size: 0.8rem; color: #d8d0b8; }
.sk-eff-val { color: #6fbfa8; font-size: 0.76rem; }
.sk-eff-desc { font-size: 0.74rem; color: var(--text-muted); line-height: 1.45; }
</style>
