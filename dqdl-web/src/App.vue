<template>
  <!-- 开始界面 -->
  <div v-if="!gameStarted" class="start-screen">
    <div class="title-glow">斗气大陆</div>
    <p class="subtitle">AI 文字冒险</p>
    <template v-if="!loading">
      <button v-if="hasSave" class="btn-start continue-btn" @click="continueGame">继续游戏</button>
      <button class="btn-start" :class="{ 'new-btn': hasSave }" @click="newGame">新游戏</button>
    </template>
    <div v-else class="loading-box">
      <div class="spinner"></div>
      <p class="loading-text">{{ loadingText }}</p>
    </div>
  </div>

  <!-- 游戏界面 -->
  <div v-else class="game-screen">
    <!-- 顶栏 -->
    <div class="top-bar">
      <span class="player-name">{{ player?.name }}</span>
      <div class="top-bar-right">
        <button class="btn-backpack" @click="toggleBackpack">背包</button>
        <button class="btn-role" @click="showRole = true">角色</button>
      </div>
    </div>

    <!-- 角色面板弹窗 -->
    <div class="role-overlay" v-if="showRole" @click="showRole = false">
      <div class="role-panel" @click.stop>
        <div class="role-header">
          <span class="role-title">{{ player?.name }}</span>
          <button class="role-close" @click="showRole = false">&times;</button>
        </div>
        <div class="role-tabs">
          <div class="role-tab" :class="{active: roleTab==='attr'}" @click="roleTab='attr'">人物</div>
          <div class="role-tab" :class="{active: roleTab==='tech'}" @click="roleTab='tech'">功法</div>
        </div>

        <!-- 人物 Tab -->
        <div class="role-body" v-if="roleTab==='attr'">
          <div class="attr-row" v-for="(label, key) in attrLabels" :key="key">
            <span class="attr-label">{{ label }}</span>
            <span class="attr-base">{{ player?.[key] ?? 0 }}</span>
            <span class="attr-bonus" v-if="(player?.final_attrs?.[key] ?? 0) - (player?.[key] ?? 0) > 0">
              +{{ (player?.final_attrs?.[key] ?? 0) - (player?.[key] ?? 0) }}
            </span>
            <span class="attr-final">
              {{ player?.final_attrs?.[key] ?? player?.[key] ?? 0 }}
            </span>
          </div>
        </div>

        <!-- 功法 Tab -->
        <div class="role-body" v-if="roleTab==='tech' && player?.technique">
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
        <div class="role-body" v-if="roleTab==='tech' && !player?.technique">
          <p style="color:#888">未装备功法</p>
        </div>
      </div>
    </div>

    <!-- 地图导航（面包屑） -->
    <div class="breadcrumb">
      <template v-for="(node, idx) in breadcrumb" :key="node.id">
        <span class="sep" v-if="idx > 0"> &gt; </span>
        <span
          v-if="idx < breadcrumb.length - 1"
          class="crumb-link"
          @click="moveTo(node, idx)"
        >{{ node.name }}</span>
        <span v-else class="crumb-current">{{ node.name }}</span>
      </template>
    </div>

    <!-- 当前地点信息 -->
    <div class="location-info" v-if="currentLocation">
      <div class="loc-header">
        <span class="loc-name">{{ currentLocation.name }}</span>
        <span class="loc-type-badge">{{ typeLabel(currentLocation.loc_type) }}</span>
        <span class="loc-danger" v-if="currentLocation.danger_level > 0">
          危险度 {{ dangerLabel(currentLocation.danger_level) }}
        </span>
        <span class="loc-qi" v-if="currentLocation.qi_density > 0">
          斗气浓郁度 {{ currentLocation.qi_density }}
        </span>
      </div>
      <p class="loc-desc" v-if="currentLocation.description">{{ currentLocation.description }}</p>
      <div class="loc-mobs" v-if="parseMobs(currentLocation.common_mobs).length">
        <span class="mobs-label">常见怪物：</span>
        <span class="mob-tag" v-for="mob in parseMobs(currentLocation.common_mobs)" :key="mob.mob_id">
          {{ mob.name }}<template v-if="mob.rank">（{{ mob.rank }}）</template>
        </span>
      </div>

      <!-- 历练区域 -->
      <div class="training-area" v-if="['wild','wild2','wild3'].includes(currentLocation.loc_type)">
        <button class="btn-train" @click="doTrainingEvent" :disabled="trainingLoading">
          {{ trainingLoading ? '历练中...' : '历练' }}
        </button>
        <div class="training-log" v-if="trainingLog.length">
          <div class="log-entry" :class="{ 'log-lost': evt.won === false }" v-for="(evt, idx) in trainingLog" :key="idx">
            <p class="log-text">{{ evt.text }}</p>
            <div class="log-drops" v-if="evt.drops && evt.drops.length">
              掉落：<span class="drop-item" v-for="(d, di) in evt.drops" :key="di">{{ d.name }}&times;{{ d.count }}<template v-if="di < evt.drops.length - 1">，</template></span>
            </div>
            <span class="log-meta" v-if="evt.battle">
              {{ evt.mob?.name }} · {{ evt.won === false ? '逃跑' : evt.battle.style }} · {{ evt.battle.rounds }}回合 · 胜率{{ evt.battle.win_rate }}%
            </span>
          </div>
        </div>
      </div>
    </div>

    <!-- 加载遮罩 -->
    <div class="loading-overlay" v-if="loading">
      <div class="spinner"></div>
      <p>{{ loadingText }}</p>
    </div>

    <!-- 地图区域：兄弟节点 + 子节点 -->
    <div class="map-area" v-if="!loading">
      <!-- 兄弟节点（同级可跳转） -->
      <div class="section" v-if="breadcrumb.length >= 2">
        <div class="section-title">附近地点</div>
        <div class="loc-grid">
          <div
            v-for="sib in currentSiblings"
            :key="sib.id"
            class="loc-card"
            :class="{ active: sib.id === currentLocation?.id }"
            @click="moveTo(sib, breadcrumb.length - 1)"
          >
            <span class="card-name">{{ sib.name }}</span>
            <span class="card-type">{{ typeLabel(sib.loc_type) }}</span>
            <span class="card-danger" v-if="sib.danger_level > 0">
              危险 {{ dangerLabel(sib.danger_level) }}
            </span>
          </div>
        </div>
      </div>

      <!-- 子节点（向下探索） -->
      <div class="section" v-if="currentChildren.length > 0">
        <div class="section-title">可前往的区域</div>
        <div class="loc-grid">
          <div
            v-for="child in currentChildren"
            :key="child.id"
            class="loc-card child-card"
            @click="moveTo(child, breadcrumb.length)"
          >
            <span class="card-name">{{ child.name }}</span>
            <span class="card-type">{{ typeLabel(child.loc_type) }}</span>
            <span class="card-danger" v-if="child.danger_level > 0">
              危险 {{ dangerLabel(child.danger_level) }}
            </span>
            <span class="card-qi" v-if="child.qi_density > 0">
              斗气 {{ child.qi_density }}
            </span>
          </div>
        </div>
      </div>

      <!-- 空提示 -->
      <div class="section" v-if="currentChildren.length === 0 && currentSiblings.length <= 1">
        <p class="empty-hint">这里没有更深处的区域了。</p>
      </div>

      <!-- NPC 列表 -->
      <div class="section" v-if="currentNpcs.length > 0">
        <div class="section-title">此处的NPC</div>
        <div class="loc-grid">
          <div
            v-for="npc in currentNpcs"
            :key="npc.id"
            class="loc-card npc-card"
            @click="openDialog(npc)"
          >
            <span class="card-name">{{ npc.name }}</span>
            <span class="card-type">{{ npc.gender }} · {{ npc.age }}</span>
            <span class="card-nature">{{ npc.role_name }} · {{ npc.nature_name }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 对话弹窗 -->
    <div class="dialog-overlay" v-if="dialogNpc">
      <div class="dialog-box">
        <div class="dialog-header">
          <span class="dialog-npc-name">{{ dialogNpc.name }}</span>
          <span class="dialog-npc-info">{{ dialogNpc.gender }} · {{ dialogNpc.age }} · {{ dialogNpc.role_name }} · {{ dialogNpc.nature_name }}</span>
          <button class="dialog-close" @click="closeDialog">X</button>
        </div>
        <div class="dialog-messages" ref="dialogMessages">
          <div class="msg-system">你走向了{{ dialogNpc.name }}...</div>
          <div v-for="(msg, idx) in dialogHistory" :key="idx" class="msg-pair">
            <div v-if="msg.player" class="msg-player">{{ msg.player }}</div>
            <div class="msg-npc">{{ msg.npc }}</div>
          </div>
          <div v-if="dialogLoading" class="msg-loading">思考中...</div>
        </div>
        <!-- 快捷对话选项 -->
        <div class="dialog-events" v-if="dialogNpc?.dialog_events?.length">
          <div
            v-for="evt in dialogNpc.dialog_events"
            :key="evt.id"
            class="event-btn"
            @click="handleEventClick(evt)"
          >
            {{ evt.text }}
          </div>
        </div>
        <div class="dialog-input">
          <input
            v-model="dialogInput"
            placeholder="说点什么..."
            @keyup.enter="handleSend"
            :disabled="dialogLoading"
          />
          <button @click="handleSend" :disabled="dialogLoading || !dialogInput.trim()">发送</button>
        </div>
      </div>
    </div>

    <!-- 背包弹窗 -->
    <div class="role-overlay" v-if="showBackpack" @click="showBackpack = false">
      <div class="role-panel backpack-panel" @click.stop>
        <div class="role-header">
          <span class="role-title">背包</span>
          <button class="role-close" @click="showBackpack = false">&times;</button>
        </div>
        <div class="backpack-body">
          <div v-if="backpackItems.length === 0" class="backpack-empty">背包空空如也</div>
          <div v-for="(item, idx) in backpackItems" :key="idx" class="backpack-item">
            <span class="bp-item-name">{{ item.name }}</span>
            <span class="bp-item-count">&times;{{ item.count }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { useGame } from './game/useGame'

const {
  gameStarted, loading, loadingText, player,
  breadcrumb, currentChildren, currentLocation, currentNpcs,
  dialogNpc, dialogHistory, dialogLoading,
  hasSave, newGame, continueGame, moveTo, openDialog, closeDialog, sendDialog,
  trainingLog, trainingLoading, doTrainingEvent,
  showBackpack, backpackItems, toggleBackpack,
} = useGame()

const dialogInput = ref('')

// 角色面板
const showRole = ref(false)
const roleTab = ref('attr')

const attrLabels = {
  power: '力量', intelligence: '智力', quick: '敏捷',
  stamina: '体质', lucky: '运气', energy: '斗气',
}

function rankLabel(rank) {
  const tiers = { 1: '天阶', 2: '地阶', 3: '玄阶', 4: '黄阶' }
  const grades = { 1: '上品', 2: '中品', 3: '下品' }
  const t = Math.floor(rank / 10)
  const g = rank % 10
  return (tiers[t] || '') + (grades[g] || '')
}

// 当前层级的兄弟节点
const currentSiblings = computed(() => {
  if (breadcrumb.value.length < 2) return []
  const parent = breadcrumb.value[breadcrumb.value.length - 2]
  return parent._children || []
})

function typeLabel(type) {
  const map = {
    continent: '大陆', region: '区域', empire: '帝国',
    city: '城市', wild: '野外', wild2: '野外深处', wild3: '野外核心', sect: '宗派', secret: '秘境',
    district: '区域', scene: '场景',
  }
  return map[type] || type
}

function dangerLabel(level) {
  const map = { 1: '一阶(低危)', 2: '二阶(中危)', 3: '三阶(高危)' }
  return map[level] || level
}

function parseMobs(raw) {
  if (!raw) return []
  try {
    const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function handleSend() {
  const msg = dialogInput.value.trim()
  if (!msg || dialogLoading.value) return
  dialogInput.value = ''
  sendDialog(msg)
}

// 快捷对话事件点击
function handleEventClick(evt) {
  if (dialogLoading.value) return
  sendDialog(evt.text)
}
</script>

<style scoped>
/* ===== 开始界面 ===== */
.start-screen {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  background: #0a0a0f;
  color: #e0d6c2;
}

.title-glow {
  font-size: 4rem;
  font-weight: bold;
  letter-spacing: 1rem;
  color: #f0c040;
  text-shadow: 0 0 30px rgba(240, 192, 64, 0.4), 0 0 60px rgba(240, 192, 64, 0.2);
  margin-bottom: 0.5rem;
}

.subtitle {
  font-size: 1.2rem;
  color: #8a7e6a;
  margin-bottom: 3rem;
  letter-spacing: 0.5rem;
}

.btn-start {
  padding: 14px 48px;
  font-size: 1.2rem;
  background: transparent;
  color: #f0c040;
  border: 2px solid #f0c040;
  cursor: pointer;
  letter-spacing: 0.3rem;
  transition: all 0.3s;
  margin: 8px 0;
  display: block;
  width: 260px;
}

.btn-start:hover {
  background: #f0c040;
  color: #0a0a0f;
}

.continue-btn {
  border-color: #60c080;
  color: #60c080;
}

.continue-btn:hover {
  background: #60c080;
  color: #0a0a0f;
}

.new-btn {
  border-color: #8a7e6a;
  color: #8a7e6a;
  font-size: 0.95rem;
  padding: 10px 36px;
  letter-spacing: 0.2rem;
}

.loading-box {
  text-align: center;
}

.loading-text {
  color: #8a7e6a;
  margin-top: 1rem;
  font-size: 1.1rem;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 3px solid #333;
  border-top: 3px solid #f0c040;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin { to { transform: rotate(360deg); } }

/* ===== 游戏界面 ===== */
.game-screen {
  min-height: 100vh;
  background: #0a0a0f;
  color: #e0d6c2;
  padding: 16px 24px;
  position: relative;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #1a1a2e;
  margin-bottom: 12px;
}

.player-name {
  color: #f0c040;
  font-weight: bold;
  font-size: 1.1rem;
}

.player-stat {
  color: #50c878;
  font-size: 0.9rem;
  font-weight: bold;
}

.player-attr {
  color: #6a6a7a;
  font-size: 0.85rem;
}

/* 面包屑 */
.breadcrumb {
  padding: 10px 0;
  font-size: 0.95rem;
  margin-bottom: 12px;
}

.crumb-link {
  color: #7a9ec2;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 3px;
}

.crumb-link:hover {
  color: #a0c4e8;
}

.crumb-current {
  color: #f0c040;
  font-weight: bold;
}

.sep {
  color: #3a3a4a;
  margin: 0 4px;
}

/* 地点信息 */
.location-info {
  background: #111122;
  border: 1px solid #1a1a3e;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.loc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.loc-name {
  font-size: 1.5rem;
  font-weight: bold;
  color: #e8dcc8;
}

.loc-type-badge {
  background: #1a1a3e;
  color: #7a9ec2;
  padding: 2px 10px;
  border-radius: 4px;
  font-size: 0.8rem;
}

.loc-danger {
  color: #c04040;
  font-size: 0.85rem;
}
.loc-qi {
  color: #40a0c0;
  font-size: 0.85rem;
}

.loc-desc {
  color: #8a8a9a;
  font-size: 0.95rem;
  line-height: 1.6;
}

.loc-mobs {
  margin-top: 6px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.mobs-label {
  color: #e74c3c;
  font-size: 0.85rem;
  font-weight: bold;
}
.mob-tag {
  background: rgba(231, 76, 60, 0.15);
  color: #e74c3c;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
}

/* 历练区域 */
.training-area {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid #2a2a3a;
}
.btn-train {
  background: linear-gradient(135deg, #c0392b, #e74c3c);
  color: #fff;
  border: none;
  padding: 6px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: bold;
}
.btn-train:hover { background: linear-gradient(135deg, #e74c3c, #ff6b6b); }
.btn-train:disabled { opacity: 0.5; cursor: not-allowed; }
.training-log {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}
.log-entry {
  background: #1e1e2a;
  border-left: 3px solid #e74c3c;
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 0 4px 4px 0;
}
.log-entry.log-lost {
  border-left-color: #555;
  background: #1a1a22;
}
.log-entry.log-lost .log-text {
  color: #777;
}
.log-text {
  color: #d0d0d8;
  font-size: 0.88rem;
  line-height: 1.5;
  margin: 0;
}
.log-meta {
  color: #6a6a7a;
  font-size: 0.75rem;
}

/* 掉落物 */
.log-drops {
  color: #b0a070;
  font-size: 0.82rem;
  margin-top: 4px;
}
.drop-item {
  color: #f0c040;
  font-weight: bold;
}

/* 地图区域 */
.map-area {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  font-size: 0.85rem;
  color: #5a5a6a;
  margin-bottom: 10px;
  letter-spacing: 0.1rem;
}

.loc-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.loc-card {
  background: #111122;
  border: 1px solid #1e1e3e;
  border-radius: 6px;
  padding: 12px 18px;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}

.loc-card:hover {
  border-color: #f0c040;
  background: #161630;
  transform: translateY(-1px);
}

.loc-card.active {
  border-color: #f0c040;
  background: #1a1a30;
}

.child-card {
  border-left: 3px solid #3a5a3a;
}

.child-card:hover {
  border-left-color: #5a8a5a;
}

.card-name {
  font-size: 1rem;
  color: #d0c8b8;
  font-weight: 500;
}

.card-type {
  font-size: 0.75rem;
  color: #5a5a7a;
}

.card-danger {
  font-size: 0.75rem;
  color: #8a4040;
}
.card-qi {
  font-size: 0.75rem;
  color: #40808a;
}

.empty-hint {
  color: #4a4a5a;
  font-style: italic;
}

/* 角色按钮 */
.btn-role {
  background: #3a3020;
  color: #d4b060;
  border: 1px solid #5a4a30;
  padding: 4px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-role:hover { background: #4a4030; }

.top-bar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

.btn-backpack {
  background: #2a3a3a;
  color: #60c0a0;
  border: 1px solid #3a5a5a;
  padding: 4px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-backpack:hover { background: #3a4a4a; }

/* 角色面板 */
.role-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.7);
  z-index: 300;
  display: flex;
  align-items: center;
  justify-content: center;
}
.role-panel {
  background: #1a1a24;
  border: 1px solid #3a3a4a;
  border-radius: 8px;
  width: 420px;
  max-width: 95vw;
  color: #d0d0d8;
}
.role-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a3a;
}
.role-title {
  font-size: 1.1rem;
  font-weight: bold;
  color: #e0c878;
}
.role-close {
  background: none;
  border: none;
  color: #888;
  font-size: 1.4rem;
  cursor: pointer;
}
.role-tabs {
  display: flex;
  border-bottom: 1px solid #2a2a3a;
}
.role-tab {
  flex: 1;
  text-align: center;
  padding: 8px 0;
  cursor: pointer;
  color: #888;
  font-size: 0.9rem;
  border-bottom: 2px solid transparent;
}
.role-tab.active {
  color: #e0c878;
  border-bottom-color: #e0c878;
}
.role-body {
  padding: 16px;
}

/* 属性行 */
.attr-row {
  display: flex;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid #222233;
}
.attr-label {
  width: 50px;
  color: #8a8a9a;
  font-size: 0.9rem;
}
.attr-base {
  color: #c0c0c8;
  font-size: 0.95rem;
  width: 40px;
  text-align: right;
}
.attr-bonus {
  color: #40c060;
  font-size: 0.8rem;
  margin-left: 4px;
}
.attr-final {
  margin-left: auto;
  color: #e0c878;
  font-weight: bold;
  font-size: 1rem;
}

/* 功法卡片 */
.tech-card {
  background: #20202c;
  border: 1px solid #3a3a4a;
  border-radius: 6px;
  padding: 14px;
}
.tech-name {
  font-size: 1.1rem;
  font-weight: bold;
  color: #e0c878;
}
.tech-meta {
  margin-top: 6px;
  display: flex;
  gap: 12px;
  font-size: 0.85rem;
}
.tech-attr { color: #e74c3c; }
.tech-rank { color: #9b59b6; }
.tech-desc {
  margin-top: 8px;
  color: #8a8a9a;
  font-size: 0.85rem;
  line-height: 1.5;
}
.tech-stats {
  margin-top: 8px;
  display: flex;
  gap: 16px;
  font-size: 0.85rem;
  color: #7a7a8a;
}
.tech-bonus {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-items: center;
}
.bonus-title {
  color: #8a8a9a;
  font-size: 0.85rem;
}
.bonus-item {
  background: rgba(64, 192, 96, 0.12);
  color: #40c060;
  padding: 2px 8px;
  border-radius: 3px;
  font-size: 0.8rem;
}

/* 加载遮罩 */
.loading-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(10, 10, 15, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 100;
  color: #8a7e6a;
}

/* NPC 卡片 */
.npc-card {
  border-left: 3px solid #c0a040 !important;
  cursor: pointer;
}
.npc-card:hover {
  border-left-color: #f0d060 !important;
}
.card-nature {
  font-size: 0.7rem;
  color: #7a6a5a;
}

/* 对话弹窗 */
.dialog-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}
.dialog-box {
  width: 500px;
  max-width: 90vw;
  max-height: 80vh;
  background: #111122;
  border: 1px solid #2a2a4e;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.dialog-header {
  padding: 12px 16px;
  background: #0d0d1a;
  border-bottom: 1px solid #1a1a3e;
  display: flex;
  align-items: center;
  gap: 10px;
}
.dialog-npc-name {
  color: #f0c040;
  font-weight: bold;
  font-size: 1.1rem;
}
.dialog-npc-info {
  color: #5a5a7a;
  font-size: 0.8rem;
  flex: 1;
}
.dialog-close {
  background: none;
  border: 1px solid #3a3a5a;
  color: #7a7a9a;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
}
.dialog-close:hover {
  background: #2a2a3e;
}
.dialog-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  min-height: 200px;
  max-height: 50vh;
}
.msg-system {
  color: #4a4a5a;
  font-style: italic;
  text-align: center;
  margin-bottom: 12px;
}
.msg-pair {
  margin-bottom: 12px;
}
.msg-player {
  color: #7a9ec2;
  margin-bottom: 4px;
  padding-left: 8px;
  border-left: 2px solid #3a5a7a;
}
.msg-npc {
  color: #d0c8b8;
  background: #161630;
  padding: 8px 12px;
  border-radius: 6px;
  margin-top: 4px;
}
.msg-loading {
  color: #5a5a6a;
  font-style: italic;
  text-align: center;
}
.dialog-input {
  padding: 10px 12px;
  border-top: 1px solid #1a1a3e;
  display: flex;
  gap: 8px;
}
/* 快捷对话选项 */
.dialog-events {
  padding: 8px 12px;
  border-top: 1px solid #1a1a3e;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.event-btn {
  padding: 5px 12px;
  border-radius: 14px;
  border: 1px solid #3a3a6e;
  background: #151530;
  color: #a0b0d0;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}
.event-btn:hover {
  background: #252555;
  border-color: #6a6aae;
  color: #d0d8f0;
}
.dialog-input input {
  flex: 1;
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  color: #e0d6c2;
  padding: 8px 12px;
  border-radius: 6px;
  outline: none;
  font-size: 0.9rem;
}
.dialog-input input:focus {
  border-color: #4a4a6e;
}
.dialog-input button {
  background: #f0c040;
  color: #0a0a0f;
  border: none;
  padding: 8px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
}
.dialog-input button:disabled {
  background: #3a3a4a;
  color: #5a5a6a;
  cursor: not-allowed;
}

/* 背包弹窗 */
.backpack-panel {
  max-height: 70vh;
  display: flex;
  flex-direction: column;
}
.backpack-body {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
}
.backpack-empty {
  color: #5a5a6a;
  text-align: center;
  padding: 24px 0;
  font-size: 0.95rem;
}
.backpack-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #222233;
  transition: background 0.2s;
}
.backpack-item:hover {
  background: #1f1f2c;
}
.bp-item-name {
  color: #d0c8b8;
  font-size: 0.9rem;
}
.bp-item-count {
  color: #50c878;
  font-weight: bold;
  font-size: 0.9rem;
}
</style>
