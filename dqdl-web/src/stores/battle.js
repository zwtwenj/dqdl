import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePlayerStore } from './player'
import { battleStart, battleAction } from '../api'

export const useBattleStore = defineStore('battle', () => {
  const showBattle = ref(false)
  const battleLoading = ref(false)
  const battleLog = ref([])
  const battleOver = ref(false)
  const attacking = ref(false)

  const curPlayerHp = ref(0)
  const curPlayerEnergy = ref(0)
  const playerMaxHpRef = ref(100)
  const playerMaxEnergyRef = ref(100)
  const curMobHp = ref(0)
  const mobMaxHpRef = ref(100)

  const mob = ref(null)
  const equippedSkills = ref([])

  const playerStore = usePlayerStore()

  const playerName = computed(() => playerStore.data?.name || '???')
  const playerLevel = computed(() => playerStore.data?.level || 1)
  const playerAttrs = computed(() => playerStore.data?.final_attrs || {})
  const playerPower = computed(() => playerAttrs.value.power || 0)
  const playerStamina = computed(() => playerAttrs.value.stamina || 0)
  const playerMaxHp = computed(() => playerMaxHpRef.value)
  const playerMaxEnergy = computed(() => playerMaxEnergyRef.value)

  const mobName = computed(() => mob.value?.name || '???')
  const mobLevel = computed(() => mob.value?.level || 1)
  const mobRank = computed(() => {
    const lv = mob.value?.level || 1
    if (lv <= 9) return '一阶'
    if (lv <= 19) return '二阶'
    if (lv <= 29) return '三阶'
    return '四阶'
  })
  const mobMaxHp = computed(() => mobMaxHpRef.value)

  function applySnapshot(s) {
    if (!s) return
    curPlayerHp.value = s.player.hp
    curPlayerEnergy.value = s.player.energy
    playerMaxHpRef.value = s.player.maxHp
    playerMaxEnergyRef.value = s.player.maxEnergy
    curMobHp.value = s.mob.hp
    mobMaxHpRef.value = s.mob.maxHp
    mob.value = { name: s.mob.name, level: s.mob.level, hp: s.mob.hp }
    equippedSkills.value = (s.skills || []).map(sk => ({
      id: sk.id, name: sk.name, energyCost: sk.energyCost, attr: sk.attr,
    }))
    battleLog.value = [...(s.log || [])].reverse()
    battleOver.value = !!s.over
  }

  async function open(mobId = 'WB-004') {
    showBattle.value = true
    battleLoading.value = true
    battleOver.value = false
    battleLog.value = []
    const pid = playerStore.playerId
    try {
      const res = await battleStart(pid, mobId)
      applySnapshot(res.data)
    } catch (e) {
      battleLog.value = [`战斗启动失败: ${e.response?.data?.message || e.message}`]
    }
    battleLoading.value = false
  }

  function close() {
    showBattle.value = false
    mob.value = null
    battleLog.value = []
    battleOver.value = false
    equippedSkills.value = []
  }

  async function act(body) {
    if (battleOver.value || attacking.value) return
    attacking.value = true
    try {
      const res = await battleAction(playerStore.playerId, body)
      applySnapshot(res.data)
    } catch (e) {
      battleLog.value = [`行动失败: ${e.response?.data?.message || e.message}`]
    }
    attacking.value = false
    if (battleOver.value) savePlayerState()
  }

  function playerAttack() { return act({ type: 'normal' }) }
  function skillAttack(slotIndex) { return act({ type: 'skill', slot: slotIndex }) }
  async function flee() {
    await act({ type: 'flee' })
    setTimeout(() => close(), 900)
  }

  async function savePlayerState() {
    const pid = playerStore.playerId
    if (!pid) return
    if (playerStore.data) {
      playerStore.data = { ...playerStore.data, hp: curPlayerHp.value, energy: curPlayerEnergy.value }
    }
  }

  return {
    showBattle, battleLoading, mob, battleLog, battleOver, attacking,
    playerName, playerLevel, playerPower, playerStamina,
    playerHp: curPlayerHp, playerMaxHp, playerEnergy: curPlayerEnergy, playerMaxEnergy,
    mobName, mobLevel, mobRank, mobMaxHp, mobHp: curMobHp,
    equippedSkills,
    open, close, playerAttack, skillAttack, flee,
  }
})
