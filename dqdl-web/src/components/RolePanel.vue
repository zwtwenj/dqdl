<template>
  <div class="role-overlay" @click.self="emit('close')">
    <div class="role-panel">
      <div class="role-header">
        <span class="role-title">{{ player?.name }}</span>
        <span class="role-level">{{ levelName(player?.level || 1) }}</span>
        <button class="role-close" @click="emit('close')">&times;</button>
      </div>
      <div class="role-tabs">
        <div class="role-tab" :class="{ active: tab === 'attr' }" @click="tab = 'attr'">人物</div>
        <div class="role-tab" :class="{ active: tab === 'tech' }" @click="tab = 'tech'">功法</div>
      </div>

      <!-- 人物 Tab -->
      <div class="role-body" v-if="tab === 'attr'">
        <div class="attr-vital">
          <div class="vital-item is-hp">
            <span class="vital-label">生命</span>
            <span class="vital-val">{{ player?.hp ?? 0 }} / {{ player?.final_attrs?.max_hp ?? player?.max_hp ?? 100 }}</span>
          </div>
          <div class="vital-item is-energy">
            <span class="vital-label">斗气</span>
            <span class="vital-val">{{ player?.energy ?? 0 }} / {{ player?.final_attrs?.max_energy ?? player?.max_energy ?? 100 }}</span>
          </div>
        </div>
        <div class="attr-row" v-for="key in baseAttrKeys" :key="key">
          <span class="attr-label">{{ attrLabels[key] }}</span>
          <span class="attr-base">{{ player?.[key] ?? 0 }}</span>
          <span class="attr-bonus" v-if="(player?.final_attrs?.[key] ?? 0) - (player?.[key] ?? 0) > 0">
            +{{ (player?.final_attrs?.[key] ?? 0) - (player?.[key] ?? 0) }}
          </span>
          <span class="attr-final">{{ player?.final_attrs?.[key] ?? player?.[key] ?? 0 }}</span>
        </div>
        <div class="attr-row attr-cult-row">
          <span class="attr-label">修为</span>
          <span class="attr-final attr-cult-val">{{ player?.cultivation ?? 0 }} / {{ player?.level_cultivation ?? 100 }}</span>
          <button class="role-break-btn" :disabled="!canBreakthrough" @click="doBreakthrough">突破</button>
        </div>
      </div>

      <!-- 功法 Tab -->
      <div class="role-body" v-if="tab === 'tech' && player?.technique">
        <div class="tech-card">
          <div class="tech-name">{{ player.technique.name }}</div>
          <div class="tech-meta">
            <span class="tech-attr">属性: {{ player.technique.attribute }}</span>
            <span class="tech-rank">{{ rankLabel(player.technique.rank) }}</span>
          </div>
          <div class="tech-desc" v-if="player.technique.description">{{ player.technique.description }}</div>
          <div class="tech-stats">
            <span>修为速度: {{ player.technique.growth }}</span>
            <span>最大等级: {{ player.technique.max_level }}</span>
          </div>
          <div class="tech-bonus" v-if="Object.keys(player.technique.base).length">
            <span class="bonus-title">属性加成：</span>
            <span class="bonus-item" v-for="(val, k) in player.technique.base" :key="k">
              {{ attrLabels[k] || k }} +{{ val }}
            </span>
          </div>
        </div>
      </div>
      <div class="role-body" v-if="tab === 'tech' && !player?.technique">
        <p style="color:#888">未装备功法</p>
      </div>
    </div>

    <!-- 突破结果弹框：点击任意区域关闭 -->
    <div
      v-if="breakthroughResult"
      class="break-modal"
      :class="{ 'is-success': breakthroughResult.success, 'is-fail': !breakthroughResult.success }"
      @click="clearBreakthrough"
    >
      <div class="break-card">
        <div class="break-title">{{ breakthroughResult.success ? '突破成功' : '突破失败' }}</div>
        <p class="break-text">{{ breakthroughResult.text }}</p>
        <span class="break-hint">点击任意区域关闭</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../stores/player'
import { useGameStore } from '../stores/game'
import { attrLabels, baseAttrKeys, levelName } from '../game/constants'

const emit = defineEmits(['close'])

const playerStore = usePlayerStore()
const gameStore = useGameStore()
const { data: player } = storeToRefs(playerStore)
const { breakthroughResult } = storeToRefs(gameStore)

const tab = ref('attr')

function rankLabel(rank) {
  const t = ['天阶', '地阶', '玄阶', '黄阶'], g = ['上品', '中品', '下品']
  return (t[Math.floor(rank / 10)] || '') + (g[rank % 10] || '')
}
const canBreakthrough = computed(() => {
  const cur = player.value?.cultivation ?? 0
  const max = player.value?.level_cultivation ?? 100
  return cur >= max && max > 0
})
function doBreakthrough() { gameStore.doBreakthrough() }
function clearBreakthrough() { gameStore.clearBreakthrough() }
</script>

<style scoped>
.attr-cult-row {
  margin-top: 6px;
  padding-top: 8px;
  border-top: 1px dashed rgba(201, 168, 106, 0.25);
}
.attr-cult-val { color: #6fbfa8 !important; }
.role-break-btn {
  margin-left: 8px;
  padding: 2px 12px;
  font-size: 0.76rem;
  letter-spacing: 1px;
  color: #d4af6a;
  background: rgba(60, 48, 20, 0.4);
  border: 1px solid #6a5020;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.role-break-btn:hover:not(:disabled) { background: rgba(80, 64, 28, 0.6); color: #f0d070; }
.role-break-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* 突破结果弹框 */
.break-modal {
  position: fixed;
  inset: 0;
  z-index: 4000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgba(5, 5, 12, 0.78);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
  cursor: pointer;
}
.break-card {
  width: 460px;
  max-width: 92vw;
  padding: 28px 28px 18px;
  text-align: center;
  background: var(--bg-elev-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-panel);
}
.is-success .break-card { border-color: #6fbfa8; box-shadow: 0 0 24px rgba(111, 191, 168, 0.35); }
.is-fail .break-card { border-color: #b06258; box-shadow: 0 0 24px rgba(176, 98, 88, 0.3); }
.break-title {
  font-size: 1.2rem;
  letter-spacing: 3px;
  margin-bottom: 14px;
}
.is-success .break-title { color: #6fbfa8; }
.is-fail .break-title { color: #d4926a; }
.break-text {
  color: var(--text);
  font-size: 0.95rem;
  line-height: 1.7;
  margin: 0 0 18px;
}
.break-hint {
  display: block;
  font-size: 0.76rem;
  color: #8a8a9a;
  letter-spacing: 1px;
}
</style>
