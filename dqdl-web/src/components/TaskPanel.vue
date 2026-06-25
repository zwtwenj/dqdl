<template>
  <div class="role-overlay" @click.self="emit('close')">
    <div class="role-panel task-panel" @click.stop>
      <div class="role-header">
        <span class="role-title">任务</span>
        <button class="role-close" @click="emit('close')">&times;</button>
      </div>

      <div class="task-split">
        <!-- 左：任务列表 -->
        <div class="task-list">
          <div v-if="visibleTasks.length === 0" class="task-empty">暂无任务</div>
          <div
            v-for="task in visibleTasks"
            :key="task.id"
            class="task-row"
            :class="{ active: task.id === selectedId, ready: isReady(task) }"
            @click="selectedId = task.id"
          >
            <div class="task-row-main">
              <span class="task-row-name">{{ task.name || '任务' }}</span>
              <span class="task-row-sub">{{ taskTypeLabel(task.type) }} · {{ '\u2605'.repeat(task.star || 1) }}</span>
            </div>
            <span class="task-row-status" :class="statusClass(task)">{{ statusText(task) }}</span>
          </div>
        </div>

        <!-- 右：任务详情 -->
        <div class="task-detail">
          <div v-if="!selected" class="task-empty">从左侧选择一个任务查看详情</div>
          <template v-else>
            <div class="detail-title">
              <span class="detail-name">{{ selected.name || '任务' }}</span>
              <span class="detail-type" :class="'type-' + selected.type">{{ taskTypeLabel(selected.type) }}</span>
              <span class="detail-star">{{ '\u2605'.repeat(selected.star || 1) }}</span>
            </div>

            <p class="detail-desc">{{ selected.description }}</p>

            <div class="detail-section">
              <div class="detail-label">目标</div>
              <div v-for="(tgt, ti) in parseTarget(selected.target)" :key="ti" class="detail-target">
                <span class="target-desc">{{ tgt.desc }}</span>
                <span class="target-prog" :class="{ done: tgt.current >= tgt.required }">
                  {{ tgt.current }} / {{ tgt.required }}
                </span>
              </div>
              <div v-if="!parseTarget(selected.target).length" class="detail-muted">—</div>
            </div>

            <div class="detail-section">
              <div class="detail-label">奖励</div>
              <div class="detail-rewards">
                <span v-for="(rw, ri) in parseReward(selected.reward)" :key="ri" class="reward-tag">
                  <template v-if="rw.type === 'money'">💰 {{ rw.value }} 金币</template>
                  <template v-else>{{ rw.name }} &times;{{ rw.count }}</template>
                </span>
                <span v-if="!parseReward(selected.reward).length" class="detail-muted">无</span>
              </div>
            </div>

            <div class="detail-actions">
              <button
                v-if="getTaskPath(selected) && !isReady(selected)"
                class="btn btn--sm btn--primary"
                @click="goTo(getTaskPath(selected))"
              >📍 前往 {{ getTaskPathLabel(selected) }}</button>
              <button
                v-if="selected.delivery && isReady(selected)"
                class="btn btn--sm btn--success"
                @click="goTo(selected.delivery.location_path)"
              >✨ 前往交付：{{ selected.delivery.location_label }}</button>
              <span v-else-if="selected.delivery" class="detail-muted">🏦 交付地点：{{ selected.delivery.location_label }}</span>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted, ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '../stores/task'
import { useMapStore } from '../stores/map'

const emit = defineEmits(['close'])

const taskStore = useTaskStore()
const mapStore = useMapStore()
const { list: tasks } = storeToRefs(taskStore)

const selectedId = ref(null)
const visibleTasks = computed(() => tasks.value.filter(t => t.status !== 'claimed'))
const selected = computed(
  () => visibleTasks.value.find(t => t.id === selectedId.value) || visibleTasks.value[0] || null,
)

onMounted(async () => {
  await taskStore.fetch()
  if (visibleTasks.value.length) selectedId.value = visibleTasks.value[0].id
})

function taskTypeLabel(t) { return { adventurer: '佣兵', common: '普通', main: '主线', side: '支线' }[t] || t }
function taskStatusLabel(s) { return { pending: '进行中', completed: '已完成', claimed: '已领奖' }[s] || s }
function parseTarget(raw) {
  try { const a = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(a) ? a : [] } catch { return [] }
}
function parseReward(raw) {
  try { const a = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(a) ? a : [] } catch { return [] }
}
function isReady(task) { return parseTarget(task.target).some(t => t.required) && parseTarget(task.target).every(t => t.current >= t.required) }
function statusClass(task) { return isReady(task) ? 'ready' : task.status }
function statusText(task) { return isReady(task) ? '可交付' : taskStatusLabel(task.status) }
function getTaskPath(task) { return parseTarget(task.target)[0]?.location_path || null }
function getTaskPathLabel(task) { const p = getTaskPath(task); return p ? p.map(x => x.name).join(' > ') : '' }

function goTo(path) {
  if (path?.length) mapStore.navigateToLocation(path[path.length - 1].id)
  emit('close')
}
</script>

<style scoped>
.task-panel { width: 760px; max-width: 96vw; }

.task-split {
  display: grid;
  grid-template-columns: 240px 1fr;
  min-height: 360px;
  max-height: 70vh;
}

/* 左：列表 */
.task-list {
  border-right: 1px solid var(--border);
  overflow-y: auto;
  padding: 8px;
}
.task-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 12px;
  border-radius: var(--radius);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background var(--transition), border-color var(--transition);
}
.task-row:hover { background: var(--bg-elev-2); }
.task-row.active { background: var(--bg-elev-2); border-color: var(--gold); }
.task-row-main { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.task-row-name {
  font-size: 0.92rem;
  color: var(--text);
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.task-row-sub { font-size: 0.7rem; color: var(--text-muted); }
.task-row-status {
  font-size: 0.68rem;
  padding: 1px 8px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
.task-row-status.pending { color: var(--text-muted); background: var(--bg-elev-1); }
.task-row-status.ready { color: var(--green); background: rgba(80, 200, 120, 0.15); }
.task-row-status.completed { color: var(--gold); background: rgba(240, 192, 64, 0.15); }

/* 右：详情 */
.task-detail { padding: 18px 20px; overflow-y: auto; }
.task-empty {
  grid-column: 1 / -1;
  color: var(--text-dim);
  text-align: center;
  padding: 48px 12px;
  font-style: italic;
  font-size: 0.9rem;
}
.detail-title { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; flex-wrap: wrap; }
.detail-name { font-size: 1.3rem; font-weight: 800; color: var(--gold); }
.detail-type { font-size: 0.72rem; padding: 2px 9px; border-radius: var(--radius-pill); }
.detail-type.type-adventurer { color: var(--purple); background: rgba(192, 160, 240, 0.14); }
.detail-type.type-common { color: var(--text-muted); background: var(--bg-elev-1); }
.detail-star { color: var(--gold); font-size: 0.8rem; }
.detail-desc {
  color: var(--text-muted);
  font-size: 0.92rem;
  line-height: 1.65;
  margin-bottom: 18px;
  font-style: italic;
}
.detail-section { margin-bottom: 16px; }
.detail-label {
  font-size: 0.74rem;
  color: var(--text-muted);
  letter-spacing: 0.12em;
  margin-bottom: 8px;
}
.detail-target {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--border);
  font-size: 0.88rem;
  color: var(--text);
}
.target-prog { color: var(--text-muted); white-space: nowrap; }
.target-prog.done { color: var(--green); font-weight: 700; }
.detail-rewards { display: flex; flex-wrap: wrap; gap: 6px; }
.reward-tag {
  font-size: 0.8rem;
  padding: 3px 11px;
  border-radius: var(--radius-pill);
  color: var(--gold);
  background: rgba(240, 192, 64, 0.12);
  border: 1px solid rgba(240, 192, 64, 0.3);
}
.detail-muted { color: var(--text-dim); font-size: 0.82rem; }
.detail-actions {
  margin-top: 18px;
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}
</style>
