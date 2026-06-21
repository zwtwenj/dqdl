import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePlayerStore } from './player'
import api from '../api'

function parseSkills(raw) {
  try { const a = typeof raw === 'string' ? JSON.parse(raw || '[]') : raw; return Array.isArray(a) ? a : [] } catch { return [] }
}

export const useBattleStore = defineStore('battle', () => {
  const showBattle = ref(false)
  const battleLoading = ref(false)
  const mob = ref(null)
  const skillDefs = ref([])
  const battleLog = ref([])
  const battleOver = ref(false)
  const attacking = ref(false)

  // ── current HP (separate from store) ──
  const curPlayerHp = ref(0)
  const curPlayerEnergy = ref(0)
  const curMobHp = ref(0)
  const mobMaxHp = ref(100)

  const playerStore = usePlayerStore()

  const playerName = computed(() => playerStore.data?.name || '???')
  const playerLevel = computed(() => playerStore.data?.level || 1)
  const playerAttrs = computed(() => playerStore.data?.final_attrs || {})
  const playerPower = computed(() => playerAttrs.value.power || 0)
  const playerIntelligence = computed(() => playerAttrs.value.intelligence || 0)
  const playerQuick = computed(() => playerAttrs.value.quick || 0)
  const playerStamina = computed(() => playerAttrs.value.stamina || 0)
  const playerHp = computed(() => playerStore.data?.hp || 0)
  const playerMaxHp = computed(() => playerAttrs.value.max_hp || 100)
  const playerEnergy = computed(() => playerStore.data?.energy || 0)
  const playerMaxEnergy = computed(() => playerAttrs.value.max_energy || 100)

  function getPlayerAttr(attrName) {
    const map = { power: playerPower, intelligence: playerIntelligence, quick: playerQuick, stamina: playerStamina }
    return map[attrName]?.value || 0
  }

  const equippedSkills = computed(() => {
    const skills = parseSkills(playerStore.data?.skill)
    return skills.filter(s => s.carry >= 1 && s.carry <= 5)
      .sort((a, b) => a.carry - b.carry)
      .map(s => {
        const def = skillDefs.value.find(d => d.id === s.id)
        let scaling = []
        try { scaling = typeof def?.scaling === 'string' ? JSON.parse(def.scaling) : (def?.scaling || []) } catch { scaling = [] }
        const rate = scaling[s.level - 1] || 1
        return { ...s, name: def?.name || '未知斗技', energyCost: def?.energy_cost || 0, attr: def?.attr || 'power', baseDamage: def?.base_damage || 0, scalingRate: rate }
      })
  })

  const mobName = computed(() => mob.value?.name || '???')
  const mobLevel = computed(() => mob.value?.level || 1)
  const mobRank = computed(() => {
    const lv = mob.value?.level || 1
    if (lv <= 9) return '一阶'
    if (lv <= 19) return '二阶'
    if (lv <= 29) return '三阶'
    return '四阶'
  })
  const mobHp = computed(() => mob.value?.hp || 100)
  const mobPower = computed(() => mob.value?.power || 0)
  const mobStamina = computed(() => mob.value?.stamina || 0)

  // ── damage calc: reduction% = (stamina + 800) / (level + 20) / 100, damage = power * (1 - reduction) ──
  function calcDamage(attackerPower, attackerLevel, defenderStamina) {
    const reduction = (defenderStamina + 800) / ((attackerLevel + 20) * 100)
    const cappedReduction = Math.min(0.95, Math.max(0, reduction))
    let dmg = attackerPower * (1 - cappedReduction)
    const crit = Math.random() < 0.2
    if (crit) dmg *= 2
    dmg = Math.round(dmg)
    if (dmg < 1) dmg = 1
    return { dmg, crit }
  }

  // ── actions ──

  function addLog(msg) {
    battleLog.value.unshift(msg)
    if (battleLog.value.length > 50) battleLog.value.pop()
  }

  async function open(mobId = 'WB-004') {
    showBattle.value = true
    battleLoading.value = true
    battleOver.value = false
    battleLog.value = []
    try {
      const [mobRes, skillRes] = await Promise.all([
        api.get(`/mob/mob-id/${mobId}`),
        api.get('/skill'),
      ])
      mob.value = mobRes.data || null
      skillDefs.value = skillRes.data || []
      mobMaxHp.value = mobRes.data?.hp || 100
      curMobHp.value = mobMaxHp.value
      curPlayerHp.value = playerStore.data?.hp || 0
      curPlayerEnergy.value = playerStore.data?.energy || 0
    } catch {
      mob.value = { mob_id: mobId, name: '岩甲龟', level: 13, hp: 100, power: 30, stamina: 13 }
      mobMaxHp.value = 100
      curMobHp.value = 100
      curPlayerHp.value = playerStore.data?.hp || 0
      curPlayerEnergy.value = playerStore.data?.energy || 0
    }
    battleLoading.value = false
  }

  function close() {
    showBattle.value = false
    mob.value = null
    battleLog.value = []
    battleOver.value = false
  }

  function playerAttack() {
    if (battleOver.value || attacking.value) return
    attacking.value = true

    const { dmg, crit } = calcDamage(playerPower.value, playerLevel.value, mobStamina.value)
    curMobHp.value = Math.max(0, curMobHp.value - dmg)
    addLog(crit
      ? `⚡暴击！你对${mobName.value}造成了 ${dmg} 点伤害`
      : `你攻击了${mobName.value}，造成 ${dmg} 点伤害`)

    if (curMobHp.value <= 0) {
      addLog(`🎉 你击败了${mobName.value}！`)
      battleOver.value = true
      savePlayerState()
      attacking.value = false
      return
    }

    setTimeout(() => {
      mobCounter()
      attacking.value = false
    }, 600)
  }

  function skillAttack(slotIndex) {
    if (battleOver.value || attacking.value) return
    const skill = equippedSkills.value[slotIndex]
    if (!skill) return
    if (playerEnergy.value < skill.energyCost) {
      addLog(`斗气不足，无法使用${skill.name}`)
      return
    }

    attacking.value = true
    curPlayerEnergy.value = Math.max(0, curPlayerEnergy.value - skill.energyCost)

    const attrVal = getPlayerAttr(skill.attr)
    const rawDamage = attrVal * skill.scalingRate + skill.baseDamage
    const { dmg, crit } = calcDamage(rawDamage, playerLevel.value, mobStamina.value)
    curMobHp.value = Math.max(0, curMobHp.value - dmg)

    addLog(crit
      ? `⚡暴击！${skill.name}对${mobName.value}造成了 ${dmg} 点伤害`
      : `${skill.name}对${mobName.value}造成 ${dmg} 点伤害`)

    if (curMobHp.value <= 0) {
      addLog(`🎉 你击败了${mobName.value}！`)
      battleOver.value = true
      savePlayerState()
      attacking.value = false
      return
    }

    setTimeout(() => {
      mobCounter()
      attacking.value = false
    }, 600)
  }

  function mobCounter() {
    const { dmg, crit } = calcDamage(mobPower.value, mobLevel.value, playerStamina.value)
    curPlayerHp.value = Math.max(0, curPlayerHp.value - dmg)
    addLog(crit
      ? `💥暴击！${mobName.value}反击造成 ${dmg} 点伤害`
      : `${mobName.value}反击，造成 ${dmg} 点伤害`)

    if (curPlayerHp.value <= 0) {
      addLog(`💀 你被${mobName.value}击败了...`)
      battleOver.value = true
    }
    savePlayerState()
  }

  function flee() {
    addLog(`🏃 你逃离了与${mobName.value}的战斗`)
    savePlayerState()
    battleOver.value = true
    setTimeout(() => close(), 1000)
  }

  async function savePlayerState() {
    const pid = playerStore.playerId
    if (!pid) return
    try {
      await api.patch(`/player/${pid}`, { hp: curPlayerHp.value, energy: curPlayerEnergy.value })
      if (playerStore.data) {
        playerStore.data = { ...playerStore.data, hp: curPlayerHp.value, energy: curPlayerEnergy.value }
      }
    } catch { /* ignore */ }
  }

  return {
    showBattle, battleLoading, mob, battleLog, battleOver, attacking,
    playerName, playerLevel, playerPower, playerStamina, playerHp: curPlayerHp, playerMaxHp, playerEnergy: curPlayerEnergy, playerMaxEnergy,
    mobName, mobLevel, mobRank, mobMaxHp, mobHp: curMobHp,
    equippedSkills,
    open, close, playerAttack, skillAttack, flee,
  }
})
