<script setup>
/**
 * 邻近之地抽屉（同级地图）：展示当前地点的同级兄弟节点。
 * 接收 locationId prop，watch 后调 getLocationSiblings 拉数据。
 * 复用通用 MapDrawer 组件。
 */
import { ref, watch } from 'vue'
import MapDrawer from './MapDrawer.vue'
import { getLocationSiblings } from '../api'

const props = defineProps({
  locationId: { type: Number, default: null },
})

const emit = defineEmits(['select'])

const neighbors = ref([])
const currentId = ref(null)

/** 拉取同级兄弟地点 */
async function loadSiblings(locationId) {
  if (!locationId) {
    neighbors.value = []
    return
  }
  try {
    neighbors.value = await getLocationSiblings(locationId)
  } catch (err) {
    console.warn('拉取同级地点失败:', err.message)
    neighbors.value = []
  }
}

watch(() => props.locationId, (id) => {
  currentId.value = null
  loadSiblings(id)
}, { immediate: true })

function onSelect(item) {
  currentId.value = item.id
  emit('select', item)
}
</script>

<template>
  <MapDrawer
    title="邻近之地"
    :items="neighbors"
    :current-id="currentId"
    @select="onSelect"
  />
</template>
