import { ref, computed } from 'vue'
import { getRoots, getChildren, getLocation, createPlayer, getPlayer, getNpcsByLocation, talkToNpc, doTraining, getBackpack, updatePlayerPosition } from '../api'

// 存档缓存 key
const SAVE_KEY = 'dqdl_save'

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

/** 检查本地是否有存档 */
function hasSave() {
  try {
    const data = localStorage.getItem(SAVE_KEY)
    if (!data) return false
    const save = JSON.parse(data)
    return !!(save && save.playerId)
  } catch { return false }
}

/** 读取本地存档 */
function loadSave() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY))
  } catch { return null }
}

/** 写入本地存档 */
function writeSave(playerId, locationId) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ playerId, locationId }))
}

/** 清除本地存档 */
function clearSave() {
  localStorage.removeItem(SAVE_KEY)
}

/** 根据面包屑构建位置路径字符串 */
function buildPosition(breadcrumb) {
  return breadcrumb.map(n => n.name).join(' > ')
}

/** 同步玩家位置到后端 + 本地缓存 */
async function syncPosition(playerId, locId) {
  const pos = buildPosition(breadcrumb.value)
  writeSave(playerId, locId)
  // 异步更新后端，不阻塞
  updatePlayerPosition(playerId, pos).catch(() => {})
}

export function useGame() {
  // 当前可点击的兄弟节点（同一父节点下的其他地点）
  const siblings = computed(() => {
    if (breadcrumb.value.length < 2) return []
    const parent = breadcrumb.value[breadcrumb.value.length - 2]
    return parent._children || []
  })

  /**
   * 新游戏：
   * 1. 清除旧存档
   * 2. 生成地图并随机选出生城市
   * 3. 创建新玩家，存入本地缓存
   */
  async function newGame() {
    loading.value = true
    clearSave()

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

      // 创建玩家（带初始位置）
      loadingText.value = '英雄降世...'
      const playerRes = await createPlayer({
        name: '旅行者',
        power: 10,
        intelligence: 8,
        quick: 7,
        stamina: 9,
        lucky: 6,
        position: buildPosition(breadcrumb.value),
      })
      // 用 findOne 重新获取完整数据（含功法+最终属性）
      const fullPlayer = await getPlayer(playerRes.data.id)
      player.value = fullPlayer.data

      // 设置当前位置
      currentLocation.value = city
      currentChildren.value = districts

      // 写入本地存档
      writeSave(player.value.id, city.id)

      gameStarted.value = true
      loading.value = false
    } catch (err) {
      console.error('游戏初始化失败:', err)
      loading.value = false
      alert('初始化失败: ' + (err.response?.data?.message || err.message))
    }
  }

  /**
   * 继续游戏：从本地存档恢复
   * 1. 读取存档中的 playerId + locationId
   * 2. 加载玩家数据
   * 3. 重建面包屑路径（通过 parent_id 向上追溯）
   */
  async function continueGame() {
    loading.value = true
    const save = loadSave()
    if (!save || !save.playerId) {
      loading.value = false
      alert('存档已损坏，请开始新游戏')
      return
    }

    try {
      loadingText.value = '读取存档...'

      // 1. 加载玩家
      const playerRes = await getPlayer(save.playerId)
      if (!playerRes.data) throw new Error('玩家数据已丢失')
      player.value = playerRes.data

      // 2. 确定当前位置：优先用存档的 locationId，否则从玩家 position 推算
      let locId = save.locationId

      // 3. 加载当前位置详情
      loadingText.value = '载入地图...'
      const locRes = await getLocation(locId)
      const target = locRes.data

      // 4. 向上追溯 parent 构建完整面包屑
      loadingText.value = '重建路径...'
      const chain = []
      let current = target
      while (current) {
        chain.unshift(current)
        if (current.parent_id) {
          current = (await getLocation(current.parent_id)).data
        } else {
          break
        }
      }
      breadcrumb.value = chain

      // 5. 加载当前地点的子节点
      loadingText.value = '读取周遭...'
      const childrenRes = await getChildren(locId)
      const children = childrenRes.data
      if (breadcrumb.value.length > 0) {
        breadcrumb.value[breadcrumb.value.length - 1]._children = children
      }
      currentLocation.value = target
      currentChildren.value = children

      // 6. 写出位置到缓存（确保 locationId 正确）
      writeSave(player.value.id, locId)
      // 同步 position 到后端
      updatePlayerPosition(player.value.id, buildPosition(breadcrumb.value)).catch(() => {})

      gameStarted.value = true
      loading.value = false
    } catch (err) {
      console.error('读档失败:', err)
      loading.value = false
      alert('读档失败: ' + (err.response?.data?.message || err.message))
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

      // 同步玩家位置到后端 + 本地缓存
      if (player.value) {
        syncPosition(player.value.id, loc.id)
      }

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
      // 历练后刷新背包
      if (res.data.drops && res.data.drops.length > 0) {
        await fetchBackpack()
      }
    } catch (err) {
      trainingLog.value.unshift({ text: '历练中出现了意外...', mob: null, battle: null, drops: [] })
    }
    trainingLoading.value = false
  }

  // 背包相关
  const showBackpack = ref(false)
  const backpackItems = ref([])

  async function fetchBackpack() {
    if (!player.value) return
    try {
      const res = await getBackpack(player.value.id)
      const raw = res.data?.items || '[]'
      backpackItems.value = typeof raw === 'string' ? JSON.parse(raw) : raw
    } catch (err) {
      console.error('背包加载失败:', err)
    }
  }

  function toggleBackpack() {
    showBackpack.value = !showBackpack.value
    if (showBackpack.value) fetchBackpack()
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
    hasSave,
    newGame,
    continueGame,
    moveTo,
    openDialog,
    closeDialog,
    sendDialog,
    trainingLog,
    trainingLoading,
    doTrainingEvent,
    showBackpack,
    backpackItems,
    fetchBackpack,
    toggleBackpack,
  }
}
