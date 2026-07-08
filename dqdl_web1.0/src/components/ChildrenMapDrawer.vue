<script setup>
/**
 * 可达之所抽屉（子级地图）：展示当前地点的子节点。
 * 接收 locationId prop，watch 后调 getLocationChildren 拉数据。
 * 若返回空数组（父节点未展开），自动调 expandLocation 触发 AI 生成，再重拉。
 * 复用通用 MapDrawer 组件。
 */
import { ref, watch } from 'vue'
import MapDrawer from './MapDrawer.vue'
import { getLocationChildren, expandLocation } from '../api'
import { bus, BusEvents } from '../utils/eventBus'

const props = defineProps({
  locationId: { type: Number, default: null },
})

const emit = defineEmits(['select'])

const children = ref([])
const currentId = ref(null)
const loading = ref(false)

/** 拉取子级地点；空时自动触发生成再重拉 */
async function loadChildren(locationId) {
  if (!locationId) {
    children.value = []
    return
  }
  loading.value = true
  try {
    let list = await getLocationChildren(locationId)
    // 空数组 → 父节点未展开，触发生成后重拉
    if (list.length === 0) {
      bus.emit(BusEvents.TOAST, { type: 'info', message: '正在探索未知之地...' })
      await expandLocation(locationId)
      list = await getLocationChildren(locationId)
    }
    children.value = list
  } catch (err) {
    console.warn('拉取子级地点失败:', err.message)
    children.value = []
  } finally {
    loading.value = false
  }
}

watch(() => props.locationId, (id) => {
  currentId.value = null
  loadChildren(id)
}, { immediate: true })

function onSelect(item) {
  currentId.value = item.id
  emit('select', item)
}
</script>

<template>
  <MapDrawer
    title="可达之所"
    :items="children"
    :current-id="currentId"
    @select="onSelect"
  />
</template>
