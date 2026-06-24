<template>
  <div class="role-overlay" @click.self="emit('close')">
    <div class="role-panel task-panel" @click.stop>
      <div class="role-header">
        <span class="role-title">任务列表</span>
        <button class="role-close" @click="emit('close')">&times;</button>
      </div>
      <div class="task-panel-body">
        <div v-if="tasks.length === 0" class="backpack-empty">暂无任务</div>
        <div
          v-for="task in tasks.filter(t => t.status === 'pending')"
          :key="task.id"
          class="task-item"
          :class="'task-status-' + task.status"
        >
          <div class="task-item-header">
            <span class="task-type-badge" :class="'type-' + task.type">{{ taskTypeLabel(task.type) }}</span>
            <span class="task-star-badge">{{ '\u2605'.repeat(task.star || 1) }}</span>
            <span class="task-status-badge" :class="'status-' + task.status">{{ taskStatusLabel(task.status) }}</span>
          </div>
          <div class="task-item-desc">{{ task.description }}</div>
          <div v-if="task.reward && task.reward.length" class="task-item-reward">
            <span v-for="(rw, ri) in task.reward" :key="ri" class="reward-tag">
              <template v-if="rw.type === 'money'">💰 {{ rw.value }} 金币</template>
              <template v-else>{{ rw.name }} &times;{{ rw.count }}</template>
            </span>
          </div>
          <div class="task-item-targets">
            <div v-for="(tgt, ti) in parseTarget(task.target)" :key="ti" class="task-target-row">
              <span class="target-desc">{{ tgt.desc }}</span>
              <span class="target-progress">
                <span :class="tgt.current >= tgt.required ? 'progress-done' : 'progress-ing'">
                  {{ tgt.current }} / {{ tgt.required }}
                </span>
              </span>
            </div>
          </div>
          <div
            v-if="getTaskPath(task) && !parseTarget(task.target).every(t => t.current >= t.required)"
            class="task-item-nav"
            @click="goTo(getTaskPath(task))"
          >📍 前往击杀：{{ getTaskPathLabel(task) }}</div>
          <div
            v-if="task.delivery && parseTarget(task.target).every(t => t.current >= t.required)"
            class="task-item-delivery ready"
            @click="goTo(task.delivery.location_path)"
          >✨ 进度已满！前往交付：{{ task.delivery.location_label }}</div>
          <div
            v-else-if="task.delivery && !parseTarget(task.target).every(t => t.current >= t.required)"
            class="task-item-delivery-hint"
          >🏦 交付地点：{{ task.delivery.location_label }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useTaskStore } from '../stores/task'
import { useMapStore } from '../stores/map'

const emit = defineEmits(['close'])

const taskStore = useTaskStore()
const mapStore = useMapStore()
const { list: tasks } = storeToRefs(taskStore)

onMounted(() => { taskStore.fetch() })

function taskTypeLabel(t) { return { adventurer: '佣兵', common: '普通', main: '主线', side: '支线' }[t] || t }
function taskStatusLabel(s) { return { pending: '进行中', completed: '已完成', claimed: '已领奖' }[s] || s }
function parseTarget(raw) {
  try { const a = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(a) ? a : [] } catch { return [] }
}
function getTaskPath(task) { return parseTarget(task.target)[0]?.location_path || null }
function getTaskPathLabel(task) { const p = getTaskPath(task); return p ? p.map(x => x.name).join(' > ') : '' }

function goTo(path) {
  if (path?.length) mapStore.navigateToLocation(path[path.length - 1].id)
  emit('close')
}
</script>
