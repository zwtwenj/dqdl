import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getRoots, getChildren, getLocation, getTree, getNpcsByLocation, updatePlayerPosition } from '../api'
import { usePlayerStore } from './player'
import { useRandomEventStore } from './randomEvent'
import { Message } from '../utils/message'

export const useMapStore = defineStore('map', () => {
  const breadcrumb = ref([])
  const currentLocation = ref(null)
  const currentChildren = ref([])
  const currentNpcs = ref([])
  const loading = ref(false)
  const loadingText = ref('')

  const currentSiblings = computed(() => {
    if (breadcrumb.value.length < 2) return []
    return breadcrumb.value[breadcrumb.value.length - 2]._children || []
  })

  function buildPositionStr() { return JSON.stringify(breadcrumb.value.map(n => n.id)) }
  function _fillTreeChildren(node) {
    if (node.children?.length) {
      node._children = node.children; for (const c of node.children) _fillTreeChildren(c)
      delete node.children
    } else { node._children = []; delete node.children }
  }

  function _startLoad(text = '载入地图...') {
    loading.value = true; loadingText.value = text
    currentNpcs.value = []
    currentChildren.value = []
  }
  function _endLoad() { loading.value = false }
  /** 进入新地点后检测随机事件(enter_location)，payload 含 locType/locationId/playerLevel */
  function _checkEnterEvent(target) {
    if (!target) return
    try {
      useRandomEventStore().tryTrigger('enter_location', {
        locType: target.loc_type,
        name: target.name,
        locationId: target.id,
        playerLevel: usePlayerStore().data?.level,
      })
    } catch { /* ignore */ }
  }

  async function loadLocationChain(locationId) {
    _startLoad('载入地图...')
    try {
      const target = (await getLocation(locationId)).data
      if (!target) throw new Error('地点不存在')

      const chain = []
      let cur = target
      while (cur) { chain.unshift(cur); cur = cur.parent_id ? (await getLocation(cur.parent_id)).data : null }

      const children = (await getChildren(locationId)).data
      chain[chain.length - 1]._children = children

      for (let i = 0; i < chain.length - 1; i++) {
        if (!chain[i]._children?.length) chain[i]._children = (await getChildren(chain[i].id)).data
      }

      const empire = chain.find(n => n.loc_type === 'empire')
      if (empire?.id) {
        loadingText.value = '探索帝国全境...'
        const t = await getTree(empire.id); _fillTreeChildren(t.data)
        empire._children = t.data._children || []
      }

      breadcrumb.value = chain; currentLocation.value = target; currentChildren.value = children
      loadingText.value = '寻找路人...'
      try { currentNpcs.value = (await getNpcsByLocation(locationId)).data || [] } catch { currentNpcs.value = [] }
      _checkEnterEvent(target)
    } finally { _endLoad() }
  }

  async function moveTo(loc, depthIndex) {
    const playerStore = usePlayerStore()
    // 以后端为权威：先把目标位置发给后端，status≠1（室内修炼/历练中等）会被 400 拒绝，
    // 拒绝则直接提示并不移动；通过后才做乐观移动与加载。
    if (playerStore.playerId) {
      const targetPath = breadcrumb.value.slice(0, depthIndex).map((n) => n.id).concat([loc.id])
      try {
        await updatePlayerPosition(playerStore.playerId, JSON.stringify(targetPath))
      } catch (e) {
        Message.error(e.response?.data?.message || '当前状态无法移动')
        return
      }
    }
    _startLoad(`前往${loc.name}...`)

    try {
      breadcrumb.value = breadcrumb.value.slice(0, depthIndex)
      const target = (await getLocation(loc.id)).data
      const cached = breadcrumb.value.find(b => b.id === loc.id)
      const children = cached?._children?.length ? cached._children : (await getChildren(loc.id)).data

      target._children = children; breadcrumb.value.push(target)

      if (target.loc_type === 'empire') {
        loadingText.value = '探索帝国全境...'
        const t = await getTree(loc.id); _fillTreeChildren(t.data)
        target._children = t.data._children || []
      }

      currentLocation.value = target; currentChildren.value = children
      try { currentNpcs.value = (await getNpcsByLocation(loc.id)).data || [] } catch { currentNpcs.value = [] }
      _checkEnterEvent(target)
      // position 已在开头通过后端校验并写入，无需再次调用
    } finally { _endLoad() }
  }

  async function navigateToLocation(locationId) {
    const playerStore = usePlayerStore()
    // 目标完整路径需先 loadLocationChain 才能得到，故采用「乐观加载 + 后端拒绝则回滚」
    const prev = {
      bc: breadcrumb.value.slice(),
      cl: currentLocation.value,
      cc: currentChildren.value.slice(),
      cn: currentNpcs.value.slice(),
    }
    await loadLocationChain(locationId)
    if (playerStore.playerId) {
      try {
        await updatePlayerPosition(playerStore.playerId, buildPositionStr())
      } catch (e) {
        // 后端权威拒绝：回滚到移动前
        breadcrumb.value = prev.bc
        currentLocation.value = prev.cl
        currentChildren.value = prev.cc
        currentNpcs.value = prev.cn
        Message.error(e.response?.data?.message || '当前状态无法移动')
      }
    }
  }

  return {
    breadcrumb, currentLocation, currentChildren, currentNpcs,
    currentSiblings, loading, loadingText,
    loadLocationChain, moveTo, navigateToLocation, buildPositionStr,
  }
})
