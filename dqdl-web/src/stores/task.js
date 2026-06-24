import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getPlayerTasks, acceptTask as apiAcceptTask } from '../api'
import { usePlayerStore } from './player'

export const useTaskStore = defineStore('task', () => {
  // ── state（映射 task 表列表） ──
  const list = ref([])            // task 表记录（已解析 target/reward/delivery）
  const loading = ref(false)

  // ── actions ──

  /** 供其它 store（如 dialog）切换任务相关 loading，避免直写私有字段 */
  function setLoading(v) {
    loading.value = v
  }

  async function fetch() {
    const playerStore = usePlayerStore()
    if (!playerStore.playerId) return
    try {
      const res = await getPlayerTasks(playerStore.playerId)
      list.value = res.data || []
    } catch { list.value = [] }
  }

  async function acceptCurrentTask(taskCard) {
    const playerStore = usePlayerStore()
    if (!playerStore.playerId) return
    loading.value = true
    try {
      const res = await apiAcceptTask(
        playerStore.playerId,
        taskCard.description,
        taskCard.target,
        taskCard.reward,
        taskCard.delivery,
        taskCard.star,
      )
      list.value.unshift(res.data)
      // 标记已接受
      taskCard.accepted = true
    } catch (err) {
      taskCard.error = err.response?.data?.message || err.message
    } finally {
      loading.value = false
    }
  }

  return { list, loading, setLoading, fetch, acceptCurrentTask }
})
