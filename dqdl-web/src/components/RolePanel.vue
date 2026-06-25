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
          <div class="vital-item">
            <span class="vital-label">生命</span>
            <span class="vital-val">{{ player?.hp ?? 0 }} / {{ player?.final_attrs?.max_hp ?? player?.max_hp ?? 100 }}</span>
          </div>
          <div class="vital-item">
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
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from '../stores/player'
import { useGameStore } from '../stores/game'
import { attrLabels, baseAttrKeys, levelName } from '../game/constants'

const emit = defineEmits(['close'])

const playerStore = usePlayerStore()
const gameStore = useGameStore()
const { data: player } = storeToRefs(playerStore)

const tab = ref('attr')

function rankLabel(rank) {
  const t = ['天阶', '地阶', '玄阶', '黄阶'], g = ['上品', '中品', '下品']
  return (t[Math.floor(rank / 10)] || '') + (g[rank % 10] || '')
}
function doBreakthrough() { gameStore.doBreakthrough() }
</script>
