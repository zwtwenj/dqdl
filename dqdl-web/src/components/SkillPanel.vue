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
          <div class="skill-slots-title">已装备（右键卸下）</div>
          <div class="skill-slots-row">
            <div
              v-for="slot in 5"
              :key="slot"
              class="skill-slot"
              :class="{ occupied: slotSkill(slot) }"
              @dragover.prevent
              @drop="onDropSlot(slot, $event)"
              @contextmenu.prevent="onRightClickSlot(slot)"
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
              v-for="ps in inventoryList"
              :key="ps.id"
              class="skill-item"
              draggable="true"
              @dragstart="onDragStart(ps, $event)"
            >
              <div class="skill-icon">{{ ps.name?.[0] || '技' }}</div>
              <div class="skill-name">{{ ps.name }}</div>
              <div class="skill-lv">Lv.{{ ps.level }}</div>
            </div>
            <div v-if="inventoryList.length === 0" class="skill-empty">暂无未装备斗技</div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../stores/player'
import { getSkills, updatePlayerSkills } from '../api'

const emit = defineEmits(['close'])

const playerStore = usePlayerStore()
const { data: player } = storeToRefs(playerStore)

const skillList = ref([])

function parseSkills(raw) {
  try { const a = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw; return Array.isArray(a) ? a : [] } catch { return [] }
}
function findSkillDef(id) { return skillList.value.find(s => s.id === id) || null }

const playerSkills = computed(() => parseSkills(player.value?.skill).map(ps => ({ ...ps, _def: findSkillDef(ps.id) })))
const equippedMap = computed(() => {
  const map = {}
  playerSkills.value.forEach(ps => { if (ps.carry >= 1 && ps.carry <= 5) map[ps.carry] = ps })
  return map
})
const inventoryList = computed(() => playerSkills.value.filter(ps => !ps.carry).map(ps => ({ ...ps, name: ps._def?.name || '未知斗技' })))
function slotSkill(slot) {
  const ps = equippedMap.value[slot]
  if (!ps) return null
  return { ...ps, name: ps._def?.name || '未知斗技' }
}

onMounted(async () => {
  try {
    const res = await getSkills()
    skillList.value = res.data || []
  } catch (err) { console.error('获取斗技列表失败', err) }
})

function onDragStart(ps, e) {
  e.dataTransfer.setData('text/plain', String(ps.id))
  e.dataTransfer.effectAllowed = 'move'
}
function onDropSlot(slot, e) {
  e.preventDefault()
  const id = Number(e.dataTransfer.getData('text/plain'))
  if (!id) return
  const skills = parseSkills(player.value?.skill)
  const target = skills.find(s => s.id === id)
  if (!target) return
  skills.forEach(s => { if (s.id === id) s.carry = null })
  skills.forEach(s => { if (s.carry === slot) s.carry = null })
  target.carry = slot
  saveSkills(skills)
}
function onRightClickSlot(slot) {
  const skills = parseSkills(player.value?.skill)
  const target = skills.find(s => s.carry === slot)
  if (target) { target.carry = null; saveSkills(skills) }
}
async function saveSkills(skills) {
  try {
    await updatePlayerSkills(playerStore.playerId, JSON.stringify(skills))
    playerStore.data = { ...playerStore.data, skill: JSON.stringify(skills) }
  } catch (err) { console.error('保存斗技失败', err); alert('保存斗技失败') }
}
</script>
