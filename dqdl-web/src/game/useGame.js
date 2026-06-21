import { ref, computed } from 'vue'
import { getRoots, getChildren, getLocation, getTree, createPlayer, getPlayer, getNpcsByLocation, talkToNpc, doTraining, getBackpack, sellItem, updatePlayerPosition, generateTask, acceptTask, completeAdventurerTasks, getPlayerTasks } from '../api'

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

/** 写入本地存档（只存 playerId，位置在 DB 中） */
function writeSave(playerId) {
  localStorage.setItem(SAVE_KEY, JSON.stringify({ playerId }))
}

/** 清除本地存档 */
function clearSave() {
  localStorage.removeItem(SAVE_KEY)
}

/** 根据面包屑构建位置（ID 数组 JSON，如 "[1,5,12,73]"） */
function buildPosition(breadcrumb) {
  return JSON.stringify(breadcrumb.map(n => n.id))
}

/** 解析位置 ID 数组，取最后一个（当前所在 locationId） */
function parsePositionId(position) {
  try {
    const ids = JSON.parse(position)
    if (Array.isArray(ids) && ids.length > 0) return ids[ids.length - 1]
  } catch { /**/ }
  return null
}

/** 同步玩家位置到后端 */
function syncPosition(playerId) {
  const pos = buildPosition(breadcrumb.value)
  writeSave(playerId)
  updatePlayerPosition(playerId, pos).catch(() => {})
}

/** 将后端 getTree 返回的树结构填充到面包屑的 _children 缓存中
 *  这样后续导航时子节点数据已在本地，无需再次请求 */
function _fillTreeChildren(node) {
  // 后端 getTree 已返回完整的 children 数组
  // 递归为每个节点设置 _children
  if (node.children && node.children.length > 0) {
    node._children = node.children
    for (const child of node.children) {
      _fillTreeChildren(child)
    }
    delete node.children
  } else {
    node._children = []
    delete node.children
  }
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

      // 2. 构建完整面包屑 + 加载子节点/NPC（复用公共方法）
      loadingText.value = '载入地图...'
      await _loadLocationChain(save.locationId)

      // 3. 写出位置到缓存
      writeSave(player.value.id, save.locationId)
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

      // 获取目标地点的子节点（如果面包屑缓存中已有则跳过请求）
      const cachedParent = breadcrumb.value.find(b => b.id === loc.id)
      let children
      if (cachedParent?._children && cachedParent._children.length > 0) {
        children = cachedParent._children
      } else {
        const childrenRes = await getChildren(loc.id)
        children = childrenRes.data
      }

      // 更新面包屑
      target._children = children
      breadcrumb.value.push(target)

      // empire 类型：预加载完整子树到面包屑的 _children 中
      // 这样后续导航不再触发 getChildren，直接从缓存读取
      if (target.loc_type === 'empire') {
        loadingText.value = '探索帝国全境...'
        const treeRes = await getTree(loc.id)
        _fillTreeChildren(treeRes.data)
        // 用树数据替换直接子节点
        target._children = treeRes.data._children || []
      }

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
      // 如果有任务进度更新，刷新任务列表
      if (res.data.task_updates && res.data.task_updates.length > 0) {
        await fetchTasks()
      }
    } catch (err) {
      trainingLog.value.unshift({ text: '历练中出现了意外...', mob: null, battle: null, drops: [], task_updates: [] })
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

  // ===== 交易系统 =====
  const showTrade = ref(false)
  const tradeSelling = ref(false)

  function openTrade() { showTrade.value = true; fetchBackpack() }
  function closeTrade() { showTrade.value = false }

  async function sellPlayerItem(itemName, count) {
    if (!player.value || tradeSelling.value) return
    tradeSelling.value = true
    try {
      const res = await sellItem(player.value.id, itemName, count)
      if (res.data?.error) { alert(res.data.error); return }
      // 重新拉取背包（含 price/description 富化）
      await fetchBackpack()
      if (player.value && res.data.money != null) {
        player.value = { ...player.value, money: res.data.money }
      }
      return res.data
    } catch (err) {
      alert('出售失败: ' + (err.response?.data?.message || err.message))
    } finally {
      tradeSelling.value = false
    }
  }

  // ===== 任务系统 =====
  const tasks = ref([])
  const taskLoading = ref(false)

  /** 处理对话事件回调 */
  async function handleDialogEvent(evt) {
    console.log('[handleDialogEvent] evt.event =', evt.event)
    if (!evt.event) {
      // 没有事件标识，走普通对话
      sendDialog(evt.text)
      return
    }

    let eventData
    try {
      eventData = typeof evt.event === 'string' ? JSON.parse(evt.event) : evt.event
    } catch {
      sendDialog(evt.text)
      return
    }

    if (eventData.type === 'createAdventurerTask') {
      taskLoading.value = true
      try {
        // 只生成预览，不入库
        const res = await generateTask(currentLocation.value.id)
        const preview = res.data
        const t0 = preview.target?.[0] || {}
        const delivery = preview.delivery || null
        // 在对话中插入带任务卡片的消息（含接受按鈕）
        dialogHistory.value.push({
          player: evt.text,
          npc: '本公会有以下任务，你是否接受？',
          taskCard: {
            preview: true,  // 未入库标识
            description: preview.description,
            target: preview.target,
            reward: preview.reward,
            delivery: delivery,
            star: preview.star || 1,
            location_path: t0.location_path || [],
            mob_name: t0.mob_name || '',
            kill_count: t0.kill_count || t0.required || 0,
            required: t0.required || 0,
            current: 0,
          },
        })
      } catch (err) {
        dialogHistory.value.push({
          player: evt.text,
          npc: `任务生成失败：${err.response?.data?.message || err.message}`,
        })
      } finally {
        taskLoading.value = false
      }
    } else if (eventData.type === 'completeTask') {
      taskLoading.value = true
      try {
        // 传入当前 NPC id，只交付该 NPC 关联的达标任务
        const npcId = dialogNpc.value?.id
        const res = await completeAdventurerTasks(player.value.id, npcId)
        const { count, tasks: doneTasks } = res.data
        if (count === 0) {
          dialogHistory.value.push({
            player: evt.text,
            npc: '目前没有可以交付的已完成任务。',
          })
        } else {
          const names = doneTasks.map(t => t.description).join('、')
          // 计算金币奖励
          let totalMoney = 0
          for (const dt of doneTasks) {
            const rewards = dt.reward || []
            for (const r of rewards) {
              if (r.type === 'money' && r.value) totalMoney += r.value
            }
          }
          const moneyMsg = totalMoney > 0 ? ` 获得奖励 ${totalMoney} 金币！` : ''
          dialogHistory.value.push({
            player: evt.text,
            npc: `辛苦了！已为你登记以下 ${count} 个任务完成：${names}。${moneyMsg}`,
          })
          await fetchTasks()
          // 刷新玩家数据（金币可能变化）
          if (player.value) {
            const pRes = await getPlayer(player.value.id)
            player.value = pRes.data
          }
        }
      } catch (err) {
        dialogHistory.value.push({
          player: evt.text,
          npc: `交付失败：${err.response?.data?.message || err.message}`,
        })
      } finally {
        taskLoading.value = false
      }
    } else if (eventData.type === 'trade') {
      // 打开交易面板
      openTrade()
    } else {
      // 未知事件类型，走普通对话
      sendDialog(evt.text)
    }
  }

  /**
   * 公共方法：从 locationId 构建完整面包屑、加载子节点/NPC
   * 供 continueGame / navigateToLocation 共用
   */
  async function _loadLocationChain(locationId) {
    // 1. 加载目标地点
    const locRes = await getLocation(locationId)
    const target = locRes.data
    if (!target) throw new Error('地点不存在')

    // 2. 向上追溯 parent 构建完整链
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

    // 3. 加载目标地点的子节点
    const childrenRes = await getChildren(locationId)
    const children = childrenRes.data
    chain[chain.length - 1]._children = children

    // 4. 预加载每一层的 _children（让面包屑中间层级可点击展开）
    for (let i = 0; i < chain.length - 1; i++) {
      if (!chain[i]._children || chain[i]._children.length === 0) {
        const sibRes = await getChildren(chain[i].id)
        chain[i]._children = sibRes.data
      }
    }

    // 5. empire 预加载完整子树
    const empireNode = chain.find(n => n.loc_type === 'empire')
    if (empireNode && empireNode.id) {
      const treeRes = await getTree(empireNode.id)
      _fillTreeChildren(treeRes.data)
      empireNode._children = treeRes.data._children || []
    }

    // 6. 应用到面包屑
    breadcrumb.value = chain
    currentLocation.value = target
    currentChildren.value = children

    // 7. 加载 NPC
    await loadNpcs(locationId)
  }

  /**
   * 公共跳转方法：按 locationId 导航到任意地点
   */
  async function navigateToLocation(locationId) {
    loading.value = true
    loadingText.value = '跳转中...'
    try {
      await _loadLocationChain(locationId)
      if (player.value) syncPosition(player.value.id, locationId)
      closeDialog()
      loading.value = false
    } catch (err) {
      console.error('跳转失败:', err)
      loading.value = false
    }
  }

  /** 任务地点跳转：使用公共跳转方法 */
  async function navigateToTask(locationPath) {
    if (!locationPath || locationPath.length === 0) return
    const dest = locationPath[locationPath.length - 1]
    await navigateToLocation(dest.id)
  }

  /** 玩家接受任务卡片，入库并更新卡片状态 */
  async function acceptCurrentTask(taskCard) {
    if (!player.value) return
    taskLoading.value = true
    try {
      const res = await acceptTask(
        player.value.id,
        taskCard.description,
        taskCard.target,
        taskCard.reward,
        taskCard.delivery,
        taskCard.star,
      )
      const saved = res.data
      tasks.value.unshift(saved)
      // 将卡片标识为已接受
      taskCard.preview = false
      taskCard.id = saved.id
      taskCard.accepted = true
    } catch (err) {
      const msg = err.response?.data?.message || err.message
      // 将错误信息写入卡片
      taskCard.error = msg
    } finally {
      taskLoading.value = false
    }
  }

  /** 前往交付地点（按任务的 delivery.location_path 跳转） */
  async function navigateToDelivery(delivery) {
    if (!delivery?.location_path?.length) return
    const path = delivery.location_path
    const dest = path[path.length - 1]
    await navigateToLocation(dest.id)
  }

  /** 加载玩家任务列表 */
  async function fetchTasks() {
    if (!player.value) return
    try {
      const res = await getPlayerTasks(player.value.id)
      tasks.value = res.data || []
    } catch (err) {
      console.error('任务加载失败:', err)
    }
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
    showTrade,
    tradeSelling,
    openTrade,
    closeTrade,
    sellPlayerItem,
    tasks,
    taskLoading,
    handleDialogEvent,
    fetchTasks,
    navigateToTask,
    acceptCurrentTask,
    navigateToDelivery,
    navigateToLocation,
  }
}
