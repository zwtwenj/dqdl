import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { getRoots, getChildren, getLocation, getTree, getNpcsByLocation, updatePlayerPosition } from '../api'
import { usePlayerStore } from './player'

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
    } finally { _endLoad() }
  }

  async function moveTo(loc, depthIndex) {
    const playerStore = usePlayerStore()
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
      if (playerStore.playerId) updatePlayerPosition(playerStore.playerId, buildPositionStr()).catch(() => {})
    } finally { _endLoad() }
  }

  async function navigateToLocation(locationId) {
    const playerStore = usePlayerStore()
    await loadLocationChain(locationId)
    if (playerStore.playerId) updatePlayerPosition(playerStore.playerId, buildPositionStr()).catch(() => {})
  }

  return {
    breadcrumb, currentLocation, currentChildren, currentNpcs,
    currentSiblings, loading, loadingText,
    loadLocationChain, moveTo, navigateToLocation, buildPositionStr,
  }
})
