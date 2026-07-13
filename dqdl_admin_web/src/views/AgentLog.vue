<script setup>
import { ref, onMounted } from 'vue'
import { getLogList } from '../api/agentLog'

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const callType = ref('')

async function load() {
  loading.value = true
  try {
    const data = await getLogList(page.value, size.value, callType.value)
    rows.value = data.rows
    total.value = data.total
  } finally {
    loading.value = false
  }
}

function onPage(p) {
  page.value = p
  load()
}

const callTypeOptions = ['training', 'dialog', 'encounter', 'dungeon', 'map', 'breakthrough', 'event']

function fmtPct(v) {
  if (v == null) return '-'
  return (Number(v) * 100).toFixed(1) + '%'
}

onMounted(load)
</script>

<template>
  <div v-loading="loading">
    <div class="toolbar">
      <span>场景：</span>
      <el-select v-model="callType" placeholder="全部" clearable style="width: 160px" @change="page = 1; load()">
        <el-option v-for="c in callTypeOptions" :key="c" :label="c" :value="c" />
      </el-select>
      <el-button @click="page = 1; load()">刷新</el-button>
    </div>
    <el-table :data="rows" border size="small" stripe>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="call_type" label="场景" width="100" />
      <el-table-column prop="model" label="模型" width="160" show-overflow-tooltip />
      <el-table-column label="输入/输出/总" width="160">
        <template #default="{ row }">
          {{ row.prompt_tokens }} / {{ row.completion_tokens }} / {{ row.total_tokens }}
        </template>
      </el-table-column>
      <el-table-column label="缓存命中" width="100">
        <template #default="{ row }">{{ fmtPct(row.cache_hit_ratio) }}</template>
      </el-table-column>
      <el-table-column prop="temperature" label="温度" width="70" />
      <el-table-column prop="duration_ms" label="耗时ms" width="80" />
      <el-table-column label="结果" width="70">
        <template #default="{ row }">
          <el-tag :type="row.success ? 'success' : 'danger'" size="small">{{ row.success ? '成功' : '失败' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="error_msg" label="错误" min-width="160" show-overflow-tooltip />
      <el-table-column prop="ref_type" label="关联" width="100" />
      <el-table-column prop="created_at" label="时间" width="170">
        <template #default="{ row }">{{ new Date(row.created_at).toLocaleString() }}</template>
      </el-table-column>
    </el-table>
    <el-pagination
      style="margin-top: 16px; justify-content: flex-end"
      background
      layout="total, prev, pager, next"
      :total="total"
      :page-size="size"
      :current-page="page"
      @current-change="onPage"
    />
  </div>
</template>

<style scoped>
.toolbar {
  margin-bottom: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
