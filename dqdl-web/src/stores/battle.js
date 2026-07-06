import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { usePlayerStore } from './player'
import { useOverlayStore } from './overlay'
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

  // 战斗结束回调（事件编排用）：open(mobId, onOver) 传入，战斗结束时自动 close 并回调
  // 不传则保持原行为（手动关闭）。winner: 'player' | 'mob' | 'flee'
  let pendingOnOver = null

  // 动态 z-index（由 overlay store 分配，保证后开的弹窗在上）
  const overlayZ = ref(0)

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

  /**
   * 打开战斗面板。
   * @param mobId 对手 mob_id（图鉴魔兽 WB-xxx 或事件生成的 AGENT-xxx）
   * @param onOver 可选回调，战斗结束时（自动关闭后）调用，参数为 winner：'player'|'mob'|'flee'。
   *               不传则保持原行为：战斗结束需手动关闭。
   */
  async function open(mobId = 'WB-004', onOver = null) {
    pendingOnOver = onOver
    overlayZ.value = useOverlayStore().acquire('battle')
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
      // 战斗开启失败（如 mob 不存在）：关闭面板；若有回调，通知"战斗失败"避免事件卡死
      showBattle.value = false
      const cb = pendingOnOver
      pendingOnOver = null
      if (cb) { try { cb('mob') } catch (_) {} }
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
    pendingOnOver = null
    useOverlayStore().release('battle')
  }

  /** 触发 pendingOnOver 回调（若有）并清空。事件编排战斗结束时用。 */
  function fireOnOverIfNeeded(winner) {
    const cb = pendingOnOver
    pendingOnOver = null
    if (cb) {
      close()
      try { cb(winner) } catch (e) { console.error('battle onOver 回调失败', e) }
    }
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
    if (battleOver.value) {
      savePlayerState()
      // 有回调时延迟自动关闭并通知事件编排（让玩家看到结果横幅）
      if (pendingOnOver) {
        const w = battleWinner.value === 'player' ? 'player' : 'mob'
        setTimeout(() => fireOnOverIfNeeded(w), 1200)
      }
    }
  }

  function playerAttack() { return act({ type: 'normal' }) }
  function skillAttack(slotIndex) { return act({ type: 'skill', slot: slotIndex }) }
  async function flee() {
    await act({ type: 'flee' })
    // 逃跑视为 flee 结果；有回调时通知事件编排，无回调则保持原行为（手动关闭）
    if (pendingOnOver) {
      setTimeout(() => fireOnOverIfNeeded('flee'), 900)
    } else {
      setTimeout(() => close(), 900)
    }
  }

  async function savePlayerState() {
    const pid = playerStore.playerId
    if (!pid) return
    if (playerStore.data) {
      playerStore.data = { ...playerStore.data, hp: curPlayerHp.value, energy: curPlayerEnergy.value }
    }
  }

  return {
    showBattle, battleLoading, mob, battleOver, battleWinner, attacking, overlayZ,
    playerName, playerLevel, playerPower, playerStamina,
    playerHp: curPlayerHp, playerMaxHp, playerEnergy: curPlayerEnergy, playerMaxEnergy,
    mobName, mobLevel, mobRank, mobMaxHp, mobHp: curMobHp,
    equippedSkills, playerBuffs, mobBuffs,
    playerHurt, mobHurt, playerFloaters, mobFloaters,
    open, close, playerAttack, skillAttack, flee,
  }
})
