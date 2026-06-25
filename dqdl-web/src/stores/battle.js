import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePlayerStore } from './player'
import { battleStart, battleAction } from '../api'

export const useBattleStore = defineStore('battle', () => {
  const showBattle = ref(false)
  const battleLoading = ref(false)
  const battleOver = ref(false)
  const battleWinner = ref(null)
  const attacking = ref(false)

  const curPlayerHp = ref(0)
  const curPlayerEnergy = ref(0)
  const playerMaxHpRef = ref(100)
  const playerMaxEnergyRef = ref(100)
  const curMobHp = ref(0)
  const mobMaxHpRef = ref(100)

  const mob = ref(null)
  const equippedSkills = ref([])
  const playerBuffs = ref([])
  const mobBuffs = ref([])

  // 浮动伤害数字 + 受击抖动
  const floaters = ref([])
  const playerHurt = ref(false)
  const mobHurt = ref(false)
  let evtPtr = 0
  let fid = 0

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

  const playerFloaters = computed(() => floaters.value.filter(f => f.side === 'player'))
  const mobFloaters = computed(() => floaters.value.filter(f => f.side === 'mob'))

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
    playerBuffs.value = s.player.buffs || []
    mobBuffs.value = s.mob.buffs || []
    battleOver.value = !!s.over
    battleWinner.value = s.winner ?? null
  }

  /** 从事件日志解析新增的伤害事件 → 浮动数字 + 受击抖动 */
  function spawnFloaters(eventLog, pName, mName) {
    if (!Array.isArray(eventLog)) return
    const fresh = eventLog.slice(evtPtr)
    evtPtr = eventLog.length
    const trigger = (side) => {
      const r = side === 'mob' ? mobHurt : playerHurt
      r.value = false
      requestAnimationFrame(() => { r.value = true })
      setTimeout(() => { r.value = false }, 430)
    }
    for (const e of fresh) {
      if (e.t === 'damage' && e.amount > 0) {
        const side = e.to === mName ? 'mob' : (e.to === pName ? 'player' : null)
        if (!side) continue
        const id = ++fid
        const dx = Math.round((Math.random() - 0.5) * 26)
        floaters.value.push({ id, side, text: '-' + e.amount, kind: e.crit ? 'crit' : 'dmg', dx })
        setTimeout(() => { floaters.value = floaters.value.filter(f => f.id !== id) }, 950)
        trigger(side)
      }
    }
  }

  async function open(mobId = 'WB-004') {
    showBattle.value = true
    battleLoading.value = true
    battleOver.value = false
    battleWinner.value = null
    floaters.value = []
    playerBuffs.value = []
    mobBuffs.value = []
    playerHurt.value = false
    mobHurt.value = false
    const pid = playerStore.playerId
    try {
      const res = await battleStart(pid, mobId)
      applySnapshot(res.data)
      evtPtr = 0
    } catch (e) {
      battleLoading.value = false
      return
    }
    battleLoading.value = false
  }

  function close() {
    showBattle.value = false
    mob.value = null
    battleOver.value = false
    battleWinner.value = null
    equippedSkills.value = []
    floaters.value = []
    playerBuffs.value = []
    mobBuffs.value = []
    playerHurt.value = false
    mobHurt.value = false
  }

  async function act(body) {
    if (battleOver.value || attacking.value) return
    attacking.value = true
    try {
      const res = await battleAction(playerStore.playerId, body)
      applySnapshot(res.data)
      spawnFloaters(res.data.eventLog, res.data.player?.name, res.data.mob?.name)
    } catch (e) {
      /* 错误静默 */
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
    showBattle, battleLoading, mob, battleOver, battleWinner, attacking,
    playerName, playerLevel, playerPower, playerStamina,
    playerHp: curPlayerHp, playerMaxHp, playerEnergy: curPlayerEnergy, playerMaxEnergy,
    mobName, mobLevel, mobRank, mobMaxHp, mobHp: curMobHp,
    equippedSkills, playerBuffs, mobBuffs,
    playerHurt, mobHurt, playerFloaters, mobFloaters,
    open, close, playerAttack, skillAttack, flee,
  }
})
