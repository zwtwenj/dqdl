<script setup>
import { ref, onMounted } from 'vue'
import { getDialogList } from '../api/agentLog'

const loading = ref(false)
const rows = ref([])
const total = ref(0)
const page = ref(1)
const size = ref(20)

async function load() {
  loading.value = true
  try {
    const data = await getDialogList(page.value, size.value)
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

function parseMessages(v) {
  if (!v) return []
  try {
    const arr = typeof v === 'string' ? JSON.parse(v) : v
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

onMounted(load)
</script>

<template>
  <div v-loading="loading">
    <div class="toolbar">
      <el-button @click="page = 1; load()">刷新</el-button>
    </div>
    <el-table :data="rows" border size="small" stripe row-key="id">
      <el-table-column type="expand">
        <template #default="{ row }">
          <div class="expand">
            <div class="block">
              <div class="block-title">玩家输入</div>
              <div class="block-body">{{ row.player_input || '（开场白）' }}</div>
            </div>
            <div class="block">
              <div class="block-title">NPC 回复</div>
              <div class="block-body">{{ row.reply }}</div>
            </div>
            <div class="block">
              <div class="block-title">完整 messages 快照</div>
              <div class="msg-list">
                <div v-for="(m, i) in parseMessages(row.messages)" :key="i" class="msg-item">
                  <el-tag size="small" :type="m.role === 'user' ? 'primary' : 'success'">{{ m.role }}</el-tag>
                  <span class="msg-content">{{ m.content }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </el-table-column>
      <el-table-column prop="id" label="ID" width="70" />
      <el-table-column prop="server_session_id" label="会话ID" width="80" />
      <el-table-column prop="call_index" label="第N轮" width="70" />
      <el-table-column prop="model" label="模型" width="160" show-overflow-tooltip />
      <el-table-column label="输入/输出/总" width="150">
        <template #default="{ row }">
          {{ row.prompt_tokens }} / {{ row.completion_tokens }} / {{ row.total_tokens }}
        </template>
      </el-table-column>
      <el-table-column prop="duration_ms" label="耗时ms" width="80" />
      <el-table-column label="结果" width="70">
        <template #default="{ row }">
          <el-tag :type="row.success ? 'success' : 'danger'" size="small">{{ row.success ? '成功' : '失败' }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column prop="player_input" label="玩家输入" min-width="200" show-overflow-tooltip />
      <el-table-column prop="reply" label="回复" min-width="240" show-overflow-tooltip />
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
}
.expand {
  padding: 12px 20px;
  background: #fafafa;
}
.block {
  margin-bottom: 12px;
}
.block-title {
  font-weight: 600;
  color: #303133;
  margin-bottom: 4px;
}
.block-body {
  color: #606266;
  line-height: 1.6;
  white-space: pre-wrap;
}
.msg-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.msg-item {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.msg-content {
  color: #606266;
  line-height: 1.6;
}
</style>
