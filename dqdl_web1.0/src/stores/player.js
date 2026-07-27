import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getPlayer } from '@/api'
import { useGameStore } from './game'
import { bus, BusEvents } from '@/utils/eventBus'

/**
 * 玩家 store：管理当前登录玩家的完整数据（getPlayer 聚合结果）。
 *
 * 多组件共享同一份 player，避免各组件各拉一份导致的不一致和重复请求。
 * playerId 取自 game store（进入游戏时由 StartView 写入并持久化）。
 *
 * 用法：
 *   const playerStore = usePlayerStore()
 *   await playerStore.load()        // 从服务器拉取/刷新玩家数据（任意时机可调：
 *                                   //   初始化、用完物品、移动到达后……）
 *   playerStore.player              // 响应式 player 对象
 *   playerStore.quick               // 敏捷（移动速度用）
 */
export const usePlayerStore = defineStore('player', () => {
  const player = ref(null)
  const loading = ref(false)
  const error = ref('')

  // 敏捷：移动速度用顶层 quick（与后端 move-session.service 一致，不含功法/宝物 final 加成）
  const quick = computed(() => player.value?.quick ?? 0)

  /** 从服务器拉取玩家数据并覆盖到 store。
   *  无条件重新拉取——初始化、用物品后、移动到达后等任意需要刷新的时机都可调用。 */
  async function load() {
    const game = useGameStore()
    const id = game.playerId
    if (!id) {
      error.value = '缺少玩家 id'
      return
    }
    loading.value = true
    error.value = ''
    try {
      player.value = await getPlayer(id)
    } catch (err) {
      error.value = err.message || '玩家数据加载失败'
      bus.emit(BusEvents.TOAST, { type: 'error', message: error.value })
    } finally {
      loading.value = false
    }
  }

  return { player, loading, error, quick, load }
})
