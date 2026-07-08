<script setup>
/**
 * 可达之所抽屉（子级地图）：展示当前地点的子节点。
 * 复用通用 MapDrawer 组件，仅提供标题与数据。
 * 当前用假数据，后续接入 location 接口（子级 = GET /api/location/:id/children）。
 */
import { ref } from 'vue'
import MapDrawer from './MapDrawer.vue'

/* 假数据：子级地点列表 */
const children = ref([
  { id: 11, name: '坊市', loc_type: 'market', danger_level: 0, qi_density: 0 },
  { id: 12, name: '佣兵公会', loc_type: 'district', danger_level: 0, qi_density: 0 },
  { id: 13, name: '丹房', loc_type: 'alchemy', danger_level: 0, qi_density: 0 },
  { id: 14, name: '修炼室', loc_type: 'cultivation', danger_level: 0, qi_density: 15 },
  { id: 15, name: '城主府', loc_type: 'district', danger_level: 0, qi_density: 0 },
  { id: 16, name: '拍卖行', loc_type: 'district', danger_level: 0, qi_density: 0 },
])

/* 当前选中的地点 id（高亮），子级默认不高亮 */
const currentId = ref(null)

const emit = defineEmits(['select'])
</script>

<template>
  <MapDrawer
    title="可达之所"
    :items="children"
    :current-id="currentId"
    @select="(item) => { currentId = item.id; emit('select', item) }"
  />
</template>
