<script setup>
/**
 * 事件触发配置组件：选择触发条件、编辑动态参数、设置触发概率。
 * 仅管理前端 UI 状态；点击保存时 emit('save', config)，由父组件负责落库。
 */
import { ref, watch } from 'vue'

const props = defineProps({
  /** 事件 ID（写入保存配置的 event_id） */
  eventId: { type: [String, Number], default: '' },
  /** 已保存的触发配置（详情进入时回填）：{ trigger, params, probability } | null */
  modelValue: { type: Object, default: null },
})
const emit = defineEmits(['save'])

const selectedTrigger = ref(null)          // 选中的触发条件对象
const triggerList = [
  { text: '进入地图', paramsExp: ['player', 'location_net'], value: 'enter_map' },
  { text: '完成任务', paramsExp: ['player', 'task'], value: 'complete_task' },
  { text: '击败敌人', paramsExp: ['player', 'mob'], value: 'defeat_enemy' },
  { text: '使用物品', paramsExp: ['player', 'item'], value: 'use_item' },
]
// 参数对象类型的字段定义：number=符号+数值 / string=文本 / select=多选
const objTypeList = {
  player: {
    level: { text: '玩家等级', type: 'number' },
    money: { text: '金币', type: 'number' },
  },
  location_net: {
    // location_id: { text: '位置ID', type: 'string' },
    location_type: { text: '位置类型', type: 'select', options: ['city', 'wild', 'sect'] },
  },
}
const objNames = { player: '玩家', location_net: '所在地点', task: '任务', mob: '敌人', item: '物品' }
const triggerParams = ref({})              // { [objType]: { [field]: { symbol?, value } } }
const eventProbability = ref(100)          // 触发概率 0-100

/** 切换触发条件时，按对象类型初始化参数字段 */
function changeTriggerParams() {
  const t = selectedTrigger.value
  triggerParams.value = {}
  if (!t) return
  ;(t.paramsExp || []).forEach((obj) => {
    const fields = objTypeList[obj] || {}
    triggerParams.value[obj] = {}
    Object.keys(fields).forEach((key) => {
      const f = fields[key]
      triggerParams.value[obj][key] =
        f.type === 'select'
          ? { value: [] }                        // 多选
          : f.type === 'number'
            ? { symbol: '>', value: null }       // 符号 + 数值
            : { value: '' }                      // 文本
    })
  })
}

function objName(obj) {
  return objNames[obj] || obj
}

/** 保存触发配置：汇总为 JSON 并 emit 给父组件落库（toast 由父组件反馈） */
function saveTrigger() {
  if (!selectedTrigger.value) return
  const config = {
    event_id: props.eventId,
    trigger: selectedTrigger.value.value,
    params: triggerParams.value,
    probability: Number(eventProbability.value) || 0,
  }
  emit('save', config)
}

/** 重置触发配置 */
function resetTrigger() {
  selectedTrigger.value = null
  triggerParams.value = {}
  eventProbability.value = 100
}

// 回填：父组件传入已保存配置（详情进入/保存后）→ 应用到表单
watch(
  () => props.modelValue,
  (cfg) => {
    if (!cfg?.trigger) return
    const t = triggerList.find((x) => x.value === cfg.trigger)
    if (!t) return
    selectedTrigger.value = t
    changeTriggerParams()
    // 用已保存参数覆盖默认值
    if (cfg.params) {
      Object.keys(cfg.params).forEach((obj) => {
        if (!triggerParams.value[obj]) triggerParams.value[obj] = {}
        Object.keys(cfg.params[obj] || {}).forEach((key) => {
          if (triggerParams.value[obj][key]) triggerParams.value[obj][key] = cfg.params[obj][key]
        })
      })
    }
    if (typeof cfg.probability === 'number') eventProbability.value = cfg.probability
  },
  { immediate: true },
)
</script>

<template>
  <!-- 事件触发配置 -->
  <div class="event-triggers">
    <div class="et-header">
      <span class="et-title">⚡ 事件触发配置</span>
      <el-tag v-if="selectedTrigger" size="small" type="warning">{{ selectedTrigger.text }}</el-tag>
    </div>

    <div class="et-row">
      <label class="et-label">触发条件</label>
      <el-select
        v-model="selectedTrigger"
        placeholder="请选择触发条件"
        clearable
        style="width: 220px"
        @change="changeTriggerParams"
      >
        <el-option v-for="t in triggerList" :key="t.value" :label="t.text" :value="t" />
      </el-select>
    </div>

    <!-- 动态参数区：按对象类型分组 -->
    <div v-if="selectedTrigger" class="et-params">
      <div v-for="obj in selectedTrigger.paramsExp" :key="obj" class="et-obj">
        <div class="et-obj-title">{{ objName(obj) }}</div>
        <div v-for="(f, key) in objTypeList[obj]" :key="key" class="et-row">
          <label class="et-label">{{ f.text }}</label>
          <!-- 数字：比较符号 + 数值 -->
          <template v-if="f.type === 'number'">
            <el-select v-model="triggerParams[obj][key].symbol" style="width: 90px">
              <el-option v-for="s in ['>', '<', '=']" :key="s" :label="s" :value="s" />
            </el-select>
            <el-input-number
              v-model="triggerParams[obj][key].value"
              :min="0"
              controls-position="right"
              style="width: 160px"
            />
          </template>
          <!-- 字符串：文本输入 -->
          <template v-else-if="f.type === 'string'">
            <el-input
              v-model="triggerParams[obj][key].value"
              placeholder="请输入"
              clearable
              style="width: 200px"
            />
          </template>
          <!-- 枚举：多选 -->
          <template v-else-if="f.type === 'select'">
            <el-select
              v-model="triggerParams[obj][key].value"
              multiple
              placeholder="可多选"
              style="width: 220px"
            >
              <el-option v-for="opt in f.options" :key="opt" :label="opt" :value="opt" />
            </el-select>
          </template>
        </div>
      </div>
    </div>

    <div class="et-row">
      <label class="et-label">触发概率</label>
      <el-input-number
        v-model="eventProbability"
        :min="0"
        :max="100"
        controls-position="right"
        style="width: 160px"
      />
      <span class="et-hint">%（0-100）</span>
    </div>

    <div class="et-footer">
      <el-button type="primary" size="small" :disabled="!selectedTrigger" @click="saveTrigger">
        保存触发配置
      </el-button>
      <el-button size="small" @click="resetTrigger">重置</el-button>
    </div>
  </div>
</template>

<style scoped>
/* ===== 事件触发配置面板 ===== */
.event-triggers {
  border: 1px solid #e4e7ed;
  border-radius: 8px;
  background: #fff;
  padding: 14px 16px;
  margin-bottom: 12px;
}

.et-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-bottom: 10px;
  margin-bottom: 12px;
  border-bottom: 1px solid #f0f2f5;
}

.et-title {
  font-size: 14px;
  font-weight: 600;
  color: #303133;
}

.et-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 8px 0;
  flex-wrap: wrap;
}

.et-label {
  min-width: 64px;
  flex-shrink: 0;
  font-size: 13px;
  color: #606266;
}

.et-hint {
  font-size: 12px;
  color: #909399;
}

.et-params {
  margin: 10px 0;
  padding: 4px 12px 12px;
  background: #f8f9fb;
  border-radius: 6px;
}

.et-obj {
  padding-top: 10px;
  border-top: 1px dashed #e4e7ed;
}

.et-obj:first-child {
  border-top: none;
}

.et-obj-title {
  font-size: 12px;
  font-weight: 600;
  color: #909399;
  margin-bottom: 2px;
}

.et-footer {
  display: flex;
  gap: 8px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid #f0f2f5;
}
</style>
