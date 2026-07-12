import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getBackpack, moveBackpackItem, sortBackpack } from '../api'

/**
 * 背包 store：背包数据内存常驻 + 增量更新（参考商业 RPG 的"数据常驻"模式）。
 *
 * 设计要点：
 * - 进入游戏时全量加载（loadBackpack），之后常驻内存
 * - 打开背包 UI 直接读 store，不发请求（0ms 响应）
 * - 拖拽/整理后用接口返回的数据更新 store（乐观更新）
 * - 掉落等外部变更通过 markDirty 标脏，下次打开时静默刷新
 */
export const useBackpackStore = defineStore('backpack', () => {
  /** 背包完整数据 { money, slots:[{slot,item_id,count,item,...}] } */
  const money = ref(0)
  const slots = ref([])
  /** 交易态（前端自用 UI 状态）：商店面板打开时为 true，背包右键变为出售 */
  const trading = ref(false)

  /** 是否已加载（避免重复请求） */
  const loaded = ref(false)
  /** 是否脏（有外部变更如掉落，需要重新拉取） */
  const dirty = ref(false)

  /**
   * 加载背包（从后端拉取，存入内存）。
   * 幂等：已加载且未脏则跳过（避免重复请求）。
   */
  async function load(playerId) {
    if (!playerId) return
    if (loaded.value && !dirty.value) return
    const data = await getBackpack(playerId)
    money.value = data.money ?? 0
    slots.value = data.slots ?? []
    loaded.value = true
    dirty.value = false
  }

  /** 强制刷新（无视缓存，重新拉取） */
  async function reload(playerId) {
    if (!playerId) return
    const data = await getBackpack(playerId)
    money.value = data.money ?? 0
    slots.value = data.slots ?? []
    loaded.value = true
    dirty.value = false
  }

  /** 标记脏（掉落等外部变更时调用，下次 load 会重新拉取） */
  function markDirty() {
    dirty.value = true
  }

  /** 重置（切换角色/退出游戏时调用） */
  function reset() {
    money.value = 0
    slots.value = []
    loaded.value = false
    dirty.value = false
  }

  /**
   * 拖拽移动物品（调后端 + 用返回数据更新内存）。
   * 返回更新后的 slots。
   */
  async function move(playerId, fromSlot, toSlot) {
    const data = await moveBackpackItem(playerId, fromSlot, toSlot)
    slots.value = data.slots ?? []
    return data.slots
  }

  /**
   * 整理背包（调后端 + 用返回数据更新内存）。
   * 返回更新后的 slots。
   */
  async function sort(playerId) {
    const data = await sortBackpack(playerId)
    slots.value = data.slots ?? []
    return data.slots
  }

  /** 设置交易态（商店面板开关时调用） */
  function setTrading(v) {
    trading.value = v
  }

  /** 同步金币（buy/sell 返回后调用） */
  function setMoney(v) {
    money.value = v
  }

  return {
    money, slots, loaded, dirty, trading,
    load, reload, markDirty, reset, move, sort,
    setTrading, setMoney,
  }
})
