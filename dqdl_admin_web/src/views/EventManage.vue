<script setup>
/**
 * 事件管理列表页：展示 story_event 表生成的事件。
 *  - 「生成事件」按钮：调 agent 生成新事件（v5 网状故事）入库后刷新
 *  - 每行「详情」→ 跳 /events/:id（拖拽编辑占位页）
 */
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import { getEventList, generateEvent } from '../api/eventManage'

const router = useRouter()

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(20)
const keyword = ref('')
const generating = ref(false)

async function load() {
  loading.value = true
  try {
    const data = await getEventList(page.value, size.value, keyword.value)
    rows.value = data.rows || []
    total.value = data.total || 0
  } catch {
    rows.value = []
    total.value = 0
  } finally {
    loading.value = false
  }
}

function onPage(p) {
  page.value = p
  load()
}

function onSearch() {
  page.value = 1
  load()
}

/** 生成新事件：确认 → 调 agent（可能耗时较长）→ 成功后刷新 */
async function onGenerate() {
  try {
    const { value } = await ElMessageBox.prompt(
      '输入事件主题（留空用默认主题）。生成需要数分钟，请耐心等待。',
      '生成事件',
      { confirmButtonText: '开始生成', cancelButtonText: '取消', inputPlaceholder: '可选：事件主题' },
    )
    generating.value = true
    ElMessage.info('正在生成事件（agent 处理中，耗时较长）...')
    try {
      const res = await generateEvent(value)
      if (res?.ok) {
        ElMessage.success(`生成成功：${res.title || res.story_id || ''}`)
      } else {
        ElMessage.error(res?.msg || '生成失败')
      }
    } finally {
      generating.value = false
    }
    load()
  } catch {
    // 取消对话框
  }
}

function onDetail(row) {
  router.push(`/events/${row.id}`)
}

onMounted(load)
</script>

<template>
  <div v-loading="loading">
    <div class="toolbar">
      <el-input
        v-model="keyword"
        placeholder="搜索标题 / 主题 / story_id"
        clearable
        style="width: 260px; margin-right: 8px"
        @keyup.enter="onSearch"
        @clear="onSearch"
      />
      <el-button type="primary" @click="onSearch">搜索</el-button>
      <el-button type="success" :loading="generating" @click="onGenerate">
        {{ generating ? '生成中...' : '生成事件' }}
      </el-button>
      <el-button @click="onSearch">刷新</el-button>
    </div>

    <el-table :data="rows" border size="small" stripe>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="story_id" label="story_id" width="220" show-overflow-tooltip />
      <el-table-column prop="title" label="标题" min-width="180" show-overflow-tooltip />
      <el-table-column prop="theme" label="主题" width="100" show-overflow-tooltip />
      <el-table-column prop="endings_count" label="结局数" width="80" align="center" />
      <el-table-column prop="max_depth" label="最大深度" width="90" align="center" />
      <el-table-column prop="source" label="来源" width="80" align="center" />
      <el-table-column prop="status" label="状态" width="90" align="center" />
      <el-table-column prop="created_at" label="创建时间" width="170" show-overflow-tooltip />
      <el-table-column label="操作" width="90" align="center">
        <template #default="{ row }">
          <el-button link type="primary" size="small" @click="onDetail(row)">详情</el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      background
      layout="total, prev, pager, next"
      :total="total"
      :page-size="size"
      :current-page="page"
      style="margin-top: 10px"
      @current-change="onPage"
    />
  </div>
</template>

<style scoped>
.toolbar {
  margin-bottom: 10px;
}
</style>
