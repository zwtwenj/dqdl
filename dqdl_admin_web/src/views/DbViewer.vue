<script setup>
import { ref, onMounted, watch } from 'vue'
import { getTables, getColumns, getData } from '../api/db'

const loadingTables = ref(false)
const loadingContent = ref(false)
const tables = ref([])
const filterText = ref('')

const currentTable = ref('')
const columns = ref([])
const data = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(50)

const filteredTables = ref([])

async function loadTables() {
  loadingTables.value = true
  try {
    tables.value = await getTables()
    filteredTables.value = tables.value
  } finally {
    loadingTables.value = false
  }
}

watch(filterText, (v) => {
  filteredTables.value = tables.value.filter((t) =>
    t.name.toLowerCase().includes((v || '').toLowerCase()),
  )
})

async function selectTable(t) {
  currentTable.value = t
  page.value = 1
  await loadContent()
}

async function loadContent() {
  if (!currentTable.value) return
  loadingContent.value = true
  try {
    const [cols, d] = await Promise.all([
      getColumns(currentTable.value),
      getData(currentTable.value, page.value, size.value),
    ])
    columns.value = cols
    data.value = d.rows
    total.value = d.total
  } finally {
    loadingContent.value = false
  }
}

function onPage(p) {
  page.value = p
  loadContent()
}

onMounted(loadTables)
</script>

<template>
  <el-container class="db-page">
    <el-aside width="280px" class="table-aside">
      <div class="aside-title">数据表（{{ tables.length }}）</div>
      <el-input v-model="filterText" placeholder="过滤表名" clearable size="small" style="margin: 8px 0" />
      <div v-loading="loadingTables" class="table-list">
        <div
          v-for="t in filteredTables"
          :key="t.name"
          class="table-item"
          :class="{ active: t.name === currentTable }"
          @click="selectTable(t.name)"
        >
          <div class="table-name">{{ t.name }}</div>
          <div class="table-meta">{{ t.rows ?? 0 }} 行 · {{ t.engine }}</div>
        </div>
      </div>
    </el-aside>
    <el-main class="content-main">
      <div v-if="!currentTable" class="empty-hint">← 左侧选择一张表查看字段与数据</div>
      <div v-else v-loading="loadingContent">
        <div class="content-header">
          <span class="content-title">{{ currentTable }}</span>
          <el-tag size="small" type="info">只读</el-tag>
        </div>

        <!-- 字段说明 -->
        <el-collapse style="margin-bottom: 12px">
          <el-collapse-item title="字段定义（点击展开）" name="cols">
            <el-table :data="columns" border size="small">
              <el-table-column prop="name" label="字段" width="160" />
              <el-table-column prop="type" label="类型" width="160" />
              <el-table-column prop="nullable" label="可空" width="70" />
              <el-table-column prop="key" label="键" width="70" />
              <el-table-column prop="comment" label="注释" min-width="160" show-overflow-tooltip />
            </el-table>
          </el-collapse-item>
        </el-collapse>

        <!-- 数据 -->
        <el-table :data="data" border size="small" stripe max-height="560">
          <el-table-column
            v-for="col in columns"
            :key="col.name"
            :prop="col.name"
            :label="col.name"
            :min-width="col.type.includes('text') || col.type.includes('json') ? 240 : 120"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              <span>{{ row[col.name] == null ? 'NULL' : (typeof row[col.name] === 'object' ? JSON.stringify(row[col.name]) : row[col.name]) }}</span>
            </template>
          </el-table-column>
        </el-table>
        <el-pagination
          style="margin-top: 16px; justify-content: flex-end"
          background
          layout="total, sizes, prev, pager, next"
          :total="total"
          :page-size="size"
          :page-sizes="[20, 50, 100, 200]"
          :current-page="page"
          :total-text="`共 ${total} 行`"
          @current-change="onPage"
          @size-change="(s) => { size = s; page = 1; loadContent() }"
        />
      </div>
    </el-main>
  </el-container>
</template>

<style scoped>
.db-page {
  height: calc(100vh - 120px);
}
.table-aside {
  background: #fff;
  border-right: 1px solid #e6e6e6;
  padding: 8px;
  overflow-y: auto;
}
.aside-title {
  font-weight: 600;
  color: #303133;
  padding: 4px 8px;
}
.table-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.table-item {
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
}
.table-item:hover {
  background: #f0f7ff;
}
.table-item.active {
  background: #409eff;
  color: #fff;
}
.table-item.active .table-meta {
  color: rgba(255, 255, 255, 0.8);
}
.table-name {
  font-size: 13px;
  font-weight: 500;
}
.table-meta {
  font-size: 11px;
  color: #909399;
}
.content-main {
  background: #fff;
  padding: 16px;
}
.content-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}
.content-title {
  font-size: 16px;
  font-weight: 600;
  color: #303133;
}
.empty-hint {
  color: #909399;
  text-align: center;
  padding: 80px 0;
}
</style>
