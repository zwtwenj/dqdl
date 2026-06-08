import { ref, computed } from 'vue'
import { getRoots, getChildren, getLocation, createPlayer, getPlayer, getNpcsByLocation, talkToNpc, doTraining } from '../api'

// 游戏状态
const gameStarted = ref(false)
const loading = ref(false)
const loadingText = ref('')
const player = ref(null)

// 面包屑路径：从大陆到当前位置的完整路径
const breadcrumb = ref([])

// 当前地点的子节点（可点击移动的目的地）
const currentChildren = ref([])

// 当前地点的 NPC 列表
const currentNpcs = ref([])

// 对话状态
const dialogNpc = ref(null)       // 正在对话的 NPC
const dialogHistory = ref([])     // 对话历史
const dialogLoading = ref(false)  // 对话加载中

// 当前地点详情
const currentLocation = ref(null)

export function useGame() {
  // 当前可点击的兄弟节点（同一父节点下的其他地点）
  const siblings = computed(() => {
    if (breadcrumb.value.length < 2) return []
    const parent = breadcrumb.value[breadcrumb.value.length - 2]
    return parent._children || []
  })

  /**
   * 开始游戏：
   * 1. 获取根节点 → 展开 depth=1（区域）
   * 2. 随机选一个区域 → 展开 depth=2（帝国）
   * 3. 随机选一个帝国 → 展开 depth=3（城市/山脉等）
   * 4. 找到第一个 city → 展开 depth=4（坊市等）
   * 5. 创建玩家，放在这个 city 里
   */
  async function startGame() {
    loading.value = true

    try {
      // Step 1: 获取根节点
      loadingText.value = '天地初开...'
      const rootsRes = await getRoots()
      const roots = rootsRes.data
      if (roots.length === 0) throw new Error('没有根节点')
      const continent = roots[0]
      breadcrumb.value = [{ ...continent, _children: roots }]

      // Step 2: 展开大陆 → 获取区域
      loadingText.value = '山川成形...'
      const regionsRes = await getChildren(continent.id)
      const regions = regionsRes.data
      breadcrumb.value[0]._children = regions

      // 随机选一个区域
      const region = regions[Math.floor(Math.random() * regions.length)]
      breadcrumb.value.push({ ...region, _children: [] })

      // Step 3: 展开区域 → 获取帝国
      loadingText.value = '帝国崛起...'
      const empiresRes = await getChildren(region.id)
      const empires = empiresRes.data
      breadcrumb.value[1]._children = empires

      // 随机选一个帝国
      const empire = empires[Math.floor(Math.random() * empires.length)]
      breadcrumb.value.push({ ...empire, _children: [] })

      // Step 4: 展开帝国 → 获取城市/山脉
      loadingText.value = '城池显现...'
      const placesRes = await getChildren(empire.id)
      const places = placesRes.data
      breadcrumb.value[2]._children = places

      // 找到第一个 city
      const city = places.find(p => p.loc_type === 'city') || places[0]
      breadcrumb.value.push({ ...city, _children: [] })

      // Step 5: 展开城市 → 获取内部区域
      loadingText.value = '坊市开张...'
      const districtsRes = await getChildren(city.id)
      const districts = districtsRes.data
      breadcrumb.value[3]._children = districts

      // 创建玩家
      loadingText.value = '英雄降世...'
      const playerRes = await createPlayer({
        name: '旅行者',
        power: 10,
        intelligence: 8,
        quick: 7,
        stamina: 9,
        lucky: 6,
      })
      // 用 findOne 重新获取完整数据（含功法+最终属性）
      const fullPlayer = await getPlayer(playerRes.data.id)
      player.value = fullPlayer.data

      // 设置当前位置
      currentLocation.value = city
      currentChildren.value = districts

      gameStarted.value = true
      loading.value = false
    } catch (err) {
      console.error('游戏初始化失败:', err)
      loading.value = false
      alert('初始化失败: ' + (err.response?.data?.message || err.message))
    }
  }

  /**
   * 移动到指定地点
   * @param {object} loc - 目标地点
   * @param {number} depthIndex - 在面包屑中的层级
   */
  async function moveTo(loc, depthIndex) {
    loading.value = true
    loadingText.value = `前往${loc.name}...`

    try {
      // 截断面包屑到目标层级
      breadcrumb.value = breadcrumb.value.slice(0, depthIndex)

      // 获取目标地点详情
      const locRes = await getLocation(loc.id)
      const target = locRes.data

      // 获取目标地点的子节点
      const childrenRes = await getChildren(loc.id)
      const children = childrenRes.data

      // 更新面包屑
      target._children = children
      breadcrumb.value.push(target)

      currentLocation.value = target
      currentChildren.value = children

      // 加载当前地点 NPC
      await loadNpcs(loc.id)

      // 关闭对话
      closeDialog()

      loading.value = false
    } catch (err) {
      console.error('移动失败:', err)
      loading.value = false
    }
  }

  /** 加载地点 NPC */
  async function loadNpcs(locationId) {
    try {
      const res = await getNpcsByLocation(locationId)
      currentNpcs.value = res.data || []
    } catch (err) {
      console.error('NPC加载失败:', err)
      currentNpcs.value = []
    }
  }

  /** 打开对话，自动获取开场白 */
  async function openDialog(npc) {
    dialogNpc.value = npc
    dialogHistory.value = []
    dialogLoading.value = true

    try {
      // 发送空消息获取开场白
      const res = await talkToNpc(npc.id, '', [])
      const greeting = res.data.reply || '...'
      // 开场白单独记录（无玩家发言）
      dialogHistory.value.push({ player: '', npc: greeting })
    } catch (err) {
      console.error('开场白失败:', err)
      dialogHistory.value.push({ player: '', npc: '（沉默地看了你一眼）' })
    }

    dialogLoading.value = false
  }

  /** 关闭对话 */
  function closeDialog() {
    dialogNpc.value = null
    dialogHistory.value = []
  }

  /** 发送对话消息 */
  async function sendDialog(message) {
    if (!dialogNpc.value || dialogLoading.value) return
    dialogLoading.value = true

    try {
      const res = await talkToNpc(dialogNpc.value.id, message, dialogHistory.value)
      const reply = res.data.reply || '...'

      dialogHistory.value.push(
        { player: message, npc: reply }
      )
    } catch (err) {
      console.error('对话失败:', err)
      dialogHistory.value.push(
        { player: message, npc: '（对方没有回应）' }
      )
    }

    dialogLoading.value = false
  }

  // 历练相关
  const trainingLog = ref([]) // 历练日志
  const trainingLoading = ref(false)

  async function doTrainingEvent() {
    if (!player.value || !currentLocation.value || trainingLoading.value) return
    trainingLoading.value = true
    try {
      const res = await doTraining(player.value.id, currentLocation.value.id)
      trainingLog.value.unshift(res.data)
      if (trainingLog.value.length > 20) trainingLog.value.pop()
    } catch (err) {
      trainingLog.value.unshift({ text: '历练中出现了意外...', mob: null, battle: null })
    }
    trainingLoading.value = false
  }

  return {
    gameStarted,
    loading,
    loadingText,
    player,
    breadcrumb,
    currentChildren,
    currentLocation,
    currentNpcs,
    dialogNpc,
    dialogHistory,
    dialogLoading,
    siblings,
    startGame,
    moveTo,
    openDialog,
    closeDialog,
    sendDialog,
    trainingLog,
    trainingLoading,
    doTrainingEvent,
  }
}
