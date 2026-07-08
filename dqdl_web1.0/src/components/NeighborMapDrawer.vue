<script setup>
/**
 * 邻近之地抽屉（同级地图）：展示当前地点的同级兄弟节点。
 * 复用通用 MapDrawer 组件，仅提供标题与数据。
 * 当前用假数据，后续接入 location 接口（同级 = 同 parent 下的其他子节点）。
 */
import { ref } from 'vue'
import MapDrawer from './MapDrawer.vue'

/* 假数据：同级地点列表 */
const neighbors = ref([
  { id: 1, name: '乌坦城', loc_type: 'city', danger_level: 0, qi_density: 10 },
  { id: 2, name: '魔兽山脉', loc_type: 'wild', danger_level: 3, qi_density: 85 },
  { id: 3, name: '云岚宗', loc_type: 'sect', danger_level: 0, qi_density: 20 },
  { id: 4, name: '天焚炼气塔', loc_type: 'cultivation', danger_level: 0, qi_density: 30 },
  { id: 5, name: '黑印城', loc_type: 'city', danger_level: 0, qi_density: 8 },
  { id: 6, name: '幽冥秘境', loc_type: 'secret', danger_level: 5, qi_density: 120 },
])

/* 当前选中的地点 id（高亮） */
const currentId = ref(1)

const emit = defineEmits(['select'])
</script>

<template>
  <MapDrawer
    title="邻近之地"
    :items="neighbors"
    :current-id="currentId"
    @select="(item) => { currentId = item.id; emit('select', item) }"
  />
</template>
