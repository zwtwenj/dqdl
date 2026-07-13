<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import * as echarts from 'echarts'
import { getSummary, getTrend } from '../api/agentLog'

// 近 N 天（切换后重载所有图）
const days = ref(7)
const loading = ref(false)

// 三个图表的 DOM ref + 实例
const pieEl = ref(null)
const trendEl = ref(null)
const barEl = ref(null)
let pieChart = null
let trendChart = null
let barChart = null

async function loadAll() {
  loading.value = true
  try {
    const [summary, trend] = await Promise.all([
      getSummary(days.value),
      getTrend(days.value),
    ])
    await nextTick()
    renderPie(summary)
    renderTrend(trend)
    renderBar(summary)
  } finally {
    loading.value = false
  }
}

// 饼图：各 call_type 的 token 占比
function renderPie(summary) {
  if (!pieChart) pieChart = echarts.init(pieEl.value)
  pieChart.setOption({
    title: { text: 'Token 占比（按场景）', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
    legend: { bottom: 0 },
    series: [{
      type: 'pie',
      radius: ['40%', '70%'],
      data: summary.map((s) => ({ name: s.callType, value: Number(s.totalTokens) })),
      label: { formatter: '{b}\n{d}%' },
    }],
  })
}

// 折线图：每日 token 消耗 + 调用次数（双轴）
function renderTrend(trend) {
  if (!trendChart) trendChart = echarts.init(trendEl.value)
  trendChart.setOption({
    title: { text: 'Token 消耗 / 调用次数趋势', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    legend: { bottom: 0, data: ['Token', '调用次数', '成功率%'] },
    xAxis: { type: 'category', data: trend.map((t) => t.date) },
    yAxis: [
      { type: 'value', name: 'Token/次', position: 'left' },
      { type: 'value', name: '%', position: 'right', min: 0, max: 100 },
    ],
    series: [
      { name: 'Token', type: 'line', smooth: true, data: trend.map((t) => Number(t.totalTokens)) },
      { name: '调用次数', type: 'line', smooth: true, data: trend.map((t) => Number(t.calls)) },
      { name: '成功率%', type: 'line', yAxisIndex: 1, data: trend.map((t) => Number(t.successRate)) },
    ],
  })
}

// 柱状图：各场景平均耗时
function renderBar(summary) {
  if (!barChart) barChart = echarts.init(barEl.value)
  barChart.setOption({
    title: { text: '平均耗时（ms）/ 场景', left: 'center', textStyle: { fontSize: 14 } },
    tooltip: { trigger: 'axis' },
    grid: { left: 50, right: 30, bottom: 40 },
    xAxis: { type: 'category', data: summary.map((s) => s.callType), axisLabel: { rotate: 30 } },
    yAxis: { type: 'value', name: 'ms' },
    series: [{ type: 'bar', data: summary.map((s) => Math.round(Number(s.avgDurationMs))), itemStyle: { color: '#409eff' } }],
  })
}

// 窗口缩放重绘
function onResize() {
  pieChart?.resize()
  trendChart?.resize()
  barChart?.resize()
}

onMounted(() => {
  loadAll()
  window.addEventListener('resize', onResize)
})
onUnmounted(() => {
  window.removeEventListener('resize', onResize)
  pieChart?.dispose()
  trendChart?.dispose()
  barChart?.dispose()
})
watch(days, loadAll)
</script>

<template>
  <div v-loading="loading">
    <div class="toolbar">
      <span>时间范围：</span>
      <el-radio-group v-model="days">
        <el-radio-button :value="1">近1天</el-radio-button>
        <el-radio-button :value="7">近7天</el-radio-button>
        <el-radio-button :value="30">近30天</el-radio-button>
        <el-radio-button :value="0">全部</el-radio-button>
      </el-radio-group>
    </div>
    <el-row :gutter="20">
      <el-col :span="12">
        <el-card><div ref="pieEl" class="chart"></div></el-card>
      </el-col>
      <el-col :span="12">
        <el-card><div ref="barEl" class="chart"></div></el-card>
      </el-col>
    </el-row>
    <el-card style="margin-top: 20px">
      <div ref="trendEl" class="chart-tall"></div>
    </el-card>
  </div>
</template>

<style scoped>
.toolbar {
  margin-bottom: 16px;
}
.chart {
  height: 320px;
}
.chart-tall {
  height: 360px;
}
</style>
