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
        <button class="btn-task" @click="openTaskPanel">任务
          <span v-if="pendingTaskCount > 0" class="task-badge">{{ pendingTaskCount }}</span>
        </button>
        <button class="btn-role" @click="showRole = true">角色</button>
      </div>
    </div>

    <!-- 角色面板弹窗 -->
    <div class="role-overlay" v-if="showRole" @click="showRole = false">
      <div class="role-panel" @click.stop>
        <div class="role-header">
          <span class="role-title">{{ player?.name }}</span>
          <span class="role-level">{{ levelName(player?.level || 1) }}</span>
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
          <!-- 修为 -->
          <div class="attr-cultivation">
            <div class="attr-cult-label">修为</div>
            <div class="attr-cult-row">
            <div class="attr-cult-val">{{ player?.cultivation ?? 0 }} / {{ player?.level_cultivation ?? 100 }}</div>
            <button class="btn-breakthrough" :disabled="(player?.cultivation ?? 0) < (player?.level_cultivation ?? 100)" @click="doBreakthrough">突破</button>
          </div>
            <div class="attr-cult-bar-wrap">
              <div class="attr-cult-bar" :style="{ width: Math.min(100, ((player?.cultivation ?? 0) / (player?.level_cultivation || 1)) * 100) + '%' }"></div>
            </div>
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

      <!-- 修炼 -->
      <div class="cultivate-area" v-if="currentLocation">
        <button class="btn-cultivate" @click="doCultivate">
          修炼
        </button>
        <span class="cultivate-info">
          修为：{{ player?.cultivation ?? 0 }} / {{ player?.level_cultivation ?? 100 }}
          <template v-if="currentLocation.qi_density > 0">
            · 斗气浓郁度：{{ currentLocation.qi_density }}
          </template>
        </span>
        <!-- 修为进度条 -->
        <div class="cultivate-bar-wrap">
          <div class="cultivate-bar" :style="{ width: Math.min(100, ((player?.cultivation ?? 0) / (player?.level_cultivation || 1)) * 100) + '%' }"></div>
        </div>
      </div>
      <div class="cultivate-log" v-if="cultivationLog.length">
        <div v-for="(evt, idx) in cultivationLog" :key="idx" class="cultivate-log-entry" :class="{ 'cult-critical': evt.critical, 'cult-capped': evt.capped }">
          {{ evt.text }}
        </div>
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
            <!-- 任务进度更新指示 -->
            <div class="log-task-updates" v-if="evt.task_updates && evt.task_updates.length">
              <span
                v-for="(upd, ui) in evt.task_updates"
                :key="ui"
                class="log-task-upd"
                :class="{ 'upd-done': upd.done }"
              >
                ⚔️ {{ upd.description.slice(0, 18) }}… {{ upd.current }}/{{ upd.required }}
                <span v-if="upd.done"> ✔已完成</span>
              </span>
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
            <div class="msg-npc">
              {{ msg.npc }}
              <!-- 任务卡片 -->
              <div v-if="msg.taskCard" class="task-card">
                <div class="task-card-title">⚔️ 战斗任务 <span class="task-card-star">{{ '\u2605'.repeat(msg.taskCard.star || 1) }}</span></div>
                <div class="task-card-body">
                  <span class="task-label">前往：</span>
                  <template v-for="(loc, li) in msg.taskCard.location_path" :key="loc.id">
                    <span v-if="li > 0" class="task-arrow"> &gt; </span>
                    <span
                      class="task-loc-link"
                      @click="navigateToTask(msg.taskCard.location_path); closeDialog()"
                    >{{ loc.name }}</span>
                  </template>
                </div>
                <div class="task-card-body">
                  <span class="task-label">目标：</span>
                  击杀 <span class="task-mob">{{ msg.taskCard.mob_name }}</span>
                    <span class="task-kill">{{ msg.taskCard.kill_count }}只</span>
                </div>
                <div class="task-card-body" v-if="msg.taskCard.reward && msg.taskCard.reward.length">
                  <span class="task-label">奖励：</span>
                  <span v-for="(rw, ri) in msg.taskCard.reward" :key="ri" class="task-reward-tag">
                    <template v-if="rw.type === 'money'">💰 {{ rw.value }} 金币</template>
                    <template v-else>{{ rw.name }} &times;{{ rw.count }}</template>
                  </span>
                </div>
                <div class="task-card-progress">
                  进度：{{ msg.taskCard.current }} / {{ msg.taskCard.required }}
                </div>
                <!-- 接受按鈕区域 -->
                <div class="task-card-actions" v-if="msg.taskCard.preview && !msg.taskCard.accepted">
                  <button
                    class="btn-accept-task"
                    :disabled="taskLoading"
                    @click="acceptCurrentTask(msg.taskCard)"
                  >接受任务</button>
                </div>
                <div class="task-accepted-tip" v-else-if="msg.taskCard.accepted">
                  ✔ 已接受，前往目标地点完成任务
                </div>
                <div class="task-error-tip" v-if="msg.taskCard.error">
                  ⚠️ {{ msg.taskCard.error }}
                </div>
              </div>
            </div>
          </div>
          <div v-if="dialogLoading || taskLoading" class="msg-loading">思考中...</div>
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

    <!-- 任务面板弹窗 -->
    <div class="role-overlay" v-if="showTaskPanel" @click="showTaskPanel = false">
      <div class="role-panel task-panel" @click.stop>
        <div class="role-header">
          <span class="role-title">任务列表</span>
          <button class="role-close" @click="showTaskPanel = false">&times;</button>
        </div>
        <div class="task-panel-body">
          <div v-if="tasks.length === 0" class="backpack-empty">暂无任务</div>
          <div
            v-for="task in tasks.filter(t => t.status === 'pending')"
            :key="task.id"
            class="task-item"
            :class="'task-status-' + task.status"
          >
            <!-- 头部：类型标签 + 星级 + 状态 -->
            <div class="task-item-header">
              <span class="task-type-badge" :class="'type-' + task.type">
                {{ taskTypeLabel(task.type) }}
              </span>
              <span class="task-star-badge">
                {{ '\u2605'.repeat(task.star || 1) }}
              </span>
              <span class="task-status-badge" :class="'status-' + task.status">
                {{ taskStatusLabel(task.status) }}
              </span>
            </div>
            <!-- 描述 -->
            <div class="task-item-desc">{{ task.description }}</div>
            <!-- 奖励 -->
            <div v-if="task.reward && task.reward.length" class="task-item-reward">
              <span v-for="(rw, ri) in task.reward" :key="ri" class="reward-tag">
                <template v-if="rw.type === 'money'">💰 {{ rw.value }} 金币</template>
                <template v-else>{{ rw.name }} &times;{{ rw.count }}</template>
              </span>
            </div>
            <!-- 目标进度 -->
            <div class="task-item-targets">
              <div
                v-for="(tgt, ti) in parseTarget(task.target)"
                :key="ti"
                class="task-target-row"
              >
                <span class="target-desc">{{ tgt.desc }}</span>
                <span class="target-progress">
                  <span :class="tgt.current >= tgt.required ? 'progress-done' : 'progress-ing'">
                    {{ tgt.current }} / {{ tgt.required }}
                  </span>
                </span>
              </div>
            </div>
            <!-- 前往击杀地点 -->
            <div
              v-if="getTaskPath(task) && !parseTarget(task.target).every(t => t.current >= t.required)"
              class="task-item-nav"
              @click="navigateToTask(getTaskPath(task)); showTaskPanel = false"
            >
              📍 前往击杀：{{ getTaskPathLabel(task) }}
            </div>
            <!-- 达标后：展示交付地点，点击前往 -->
            <div
              v-if="task.delivery && parseTarget(task.target).every(t => t.current >= t.required)"
              class="task-item-delivery ready"
              @click="navigateToDelivery(task.delivery); showTaskPanel = false"
            >
              ✨ 进度已满！前往交付：{{ task.delivery.location_label }}
            </div>
            <!-- 进行中：提示交付地点 -->
            <div
              v-else-if="task.delivery && !parseTarget(task.target).every(t => t.current >= t.required)"
              class="task-item-delivery-hint"
            >
              🏦 交付地点：{{ task.delivery.location_label }}
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 背包弹窗 -->
    <div class="role-overlay" v-if="showBackpack" @click="showBackpack = false; activeTooltip = -1">
      <div class="role-panel backpack-panel" @click.stop>
        <div class="role-header">
          <span class="role-title">背包</span>
          <button class="role-close" @click="showBackpack = false; activeTooltip = -1">&times;</button>
        </div>
        <!-- 金币 -->
        <div class="backpack-money">
          <span class="money-icon">💰</span>
          <span class="money-value">{{ player?.money ?? 0 }}</span>
          <span class="money-unit">金币</span>
        </div>
        <div class="backpack-body">
          <div v-if="backpackItems.length === 0" class="backpack-empty">背包空空如也</div>
          <div
            v-for="(item, idx) in backpackItems"
            :key="idx"
            class="backpack-item"
            @click="toggleItemTooltip(idx)"
          >
            <span class="bp-item-name">{{ item.name }}</span>
            <span class="bp-item-count">&times;{{ item.count }}</span>
            <!-- 悬浮描述 -->
            <div v-if="activeTooltip === idx && (item.description || item.price)" class="item-tooltip" @click.stop>
              <div class="tooltip-name">{{ item.name }}</div>
              <div v-if="item.description" class="tooltip-desc">{{ item.description }}</div>
              <div v-if="item.price" class="tooltip-price">💰 出售价格：{{ Math.floor(item.price * 0.5) }} 金币</div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 交易弹窗 -->
    <div class="role-overlay" v-if="showTrade">
      <div class="role-panel trade-panel">
        <div class="role-header">
          <span class="role-title">交易</span>
          <button class="role-close" @click="closeTrade">&times;</button>
        </div>
        <div class="trade-body">
          <div class="trade-side trade-npc">
            <div class="trade-side-title">🏪 NPC 出售</div>
            <div class="trade-empty">暂无物品出售</div>
          </div>
          <div class="trade-side trade-player">
            <div class="trade-side-title">
              🎒 我的背包
              <span class="trade-money">💰 {{ player?.money ?? 0 }} 金币</span>
            </div>
            <div v-if="backpackItems.length === 0" class="trade-empty">背包空空如也</div>
            <div v-for="(item, idx) in backpackItems" :key="idx" class="trade-item">
              <div class="trade-item-info">
                <span class="ti-name">{{ item.name }}</span>
                <span class="ti-count">&times;{{ item.count }}</span>
                <span v-if="item.price" class="ti-sell-price">单价 {{ Math.floor(item.price * 0.5) }} 金</span>
              </div>
              <button
                class="btn-sell"
                :disabled="tradeSelling"
                @click="sellPlayerItem(item.name, $event.shiftKey ? item.count : 1)"
              >出售</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from './stores/player'
import { useMapStore } from './stores/map'
import { useDialogStore } from './stores/dialog'
import { useBackpackStore } from './stores/backpack'
import { useTaskStore } from './stores/task'
import { useGameStore } from './stores/game'

const playerStore = usePlayerStore()
const mapStore = useMapStore()
const dialogStore = useDialogStore()
const backpackStore = useBackpackStore()
const taskStore = useTaskStore()
const gameStore = useGameStore()

const { data: player } = storeToRefs(playerStore)
const { loading: playerLoading, loadingText: playerLoadingText } = storeToRefs(playerStore)
const { breadcrumb, currentLocation, currentChildren, currentNpcs, currentSiblings, loading: mapLoading, loadingText: mapLoadingText } = storeToRefs(mapStore)
const { npc: dialogNpc, history: dialogHistory, loading: dialogLoading } = storeToRefs(dialogStore)
const { items: backpackItems, showPanel: showBackpack, showTrade, tradeSelling } = storeToRefs(backpackStore)
const { list: tasks, loading: taskLoading } = storeToRefs(taskStore)
const { started: gameStarted, trainingLog, cultivationLog, trainingLoading } = storeToRefs(gameStore)

const loading = computed(() => playerStore.loading || playerLoading.value || mapLoading.value)
const loadingText = computed(() => mapLoadingText.value || playerLoadingText.value)
const hasSave = computed(() => gameStore.hasSave())

function newGame() { gameStore.newGame() }
function continueGame() { gameStore.continueGame() }
function moveTo(loc, idx) { mapStore.moveTo(loc, idx); dialogStore.close() }
function openDialog(npc) { dialogStore.open(npc) }
function closeDialog() { dialogStore.close() }
function sendDialog(msg) { dialogStore.send(msg) }
function handleEventClick(evt) { dialogStore.handleEvent(evt) }
function toggleBackpack() { backpackStore.toggle() }
function closeTrade() { backpackStore.closeTrade() }
function sellPlayerItem(name, count) { backpackStore.sell(name, count) }
function fetchTasks() { taskStore.fetch() }
function acceptCurrentTask(card) { taskStore.acceptCurrentTask(card) }
function navigateToLocation(locId) { mapStore.navigateToLocation(locId); dialogStore.close() }
function navigateToTask(path) { if (path?.length) navigateToLocation(path[path.length - 1].id) }
function navigateToDelivery(delivery) { if (delivery?.location_path?.length) navigateToLocation(delivery.location_path[delivery.location_path.length - 1].id) }
function doTrainingEvent() { gameStore.doTrainingEvent() }
function doCultivate() { gameStore.doCultivate() }
function doBreakthrough() { gameStore.doBreakthrough() }

const dialogInput = ref('')
function handleSend() { const msg = dialogInput.value.trim(); if (!msg || dialogLoading.value) return; dialogInput.value = ''; sendDialog(msg) }

const showTaskPanel = ref(false)
function openTaskPanel() { fetchTasks(); showTaskPanel.value = true }
const pendingTaskCount = computed(() => tasks.value.filter(t => t.status === 'pending').length)
function taskTypeLabel(t) { return {adventurer:'佣兵',common:'普通',main:'主线',side:'支线'}[t]||t }
function taskStatusLabel(s) { return {pending:'进行中',completed:'已完成',claimed:'已领奖'}[s]||s }
function parseTarget(raw) { try { const a = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(a) ? a : [] } catch { return [] } }
function getTaskPath(task) { return parseTarget(task.target)[0]?.location_path || null }
function getTaskPathLabel(task) { const p = getTaskPath(task); return p ? p.map(x => x.name).join(' > ') : '' }

const showRole = ref(false)
const roleTab = ref('attr')
const activeTooltip = ref(-1)
function toggleItemTooltip(idx) { activeTooltip.value = activeTooltip.value === idx ? -1 : idx }

const attrLabels = { power:'力量',intelligence:'智力',quick:'敏捷',stamina:'体质',lucky:'运气',energy:'斗气' }
function rankLabel(rank) { const t=['天阶','地阶','玄阶','黄阶'],g=['上品','中品','下品']; return (t[Math.floor(rank/10)]||'')+(g[rank%10]||'') }
function typeLabel(type) { return {continent:'大陆',region:'区域',empire:'帝国',city:'城市',wild:'野外',wild2:'野外深处',wild3:'野外核心',sect:'宗派',secret:'秘境',district:'区域',scene:'场景'}[type]||type }
function levelName(lv) {
  if (lv <= 9) return '斗之气 ' + '一二三四五六七八九'[lv - 1] + '段'
  if (lv <= 19) return '斗者 ' + '一二三四五六七八九'[lv - 11] + '星'
  if (lv <= 29) return '斗师 ' + '一二三四五六七八九'[lv - 21] + '星'
  return '大斗师 ' + '一二三四五六七八九'[lv - 31] + '星'
}
function dangerLabel(level) { return {1:'一阶(低危)',2:'二阶(中危)',3:'三阶(高危)'}[level]||level }
function parseMobs(raw) { try { const a = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(a) ? a : [] } catch { return [] } }
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
/* 修炼 */
.cultivate-area {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.cultivate-bar-wrap { flex: 1; height: 6px; background: #1a1a2e; border-radius: 3px; overflow: hidden; min-width: 80px; }
.cultivate-bar { height: 100%; background: linear-gradient(90deg, #3498db, #2ecc71); border-radius: 3px; transition: width 0.3s; }
.cultivate-log { margin-top: 6px; }
.cultivate-log-entry { font-size: 0.8rem; color: #8a8aaa; padding: 2px 0; }
.cult-critical { color: #f0c040; font-weight: bold; }
.cult-capped { color: #e06060; }
.attr-cultivation { margin-top: 12px; padding-top: 10px; border-top: 1px solid #2a2a3a; }
.role-level { font-size: 0.82rem; color: #f0c040; margin-left: auto; }
.attr-cult-row { display: flex; align-items: center; gap: 8px; }
.btn-breakthrough { padding: 3px 12px; border: 1px solid #9b59b6; background: #1a1028; color: #c39bdb; border-radius: 4px; cursor: pointer; font-size: 0.78rem; flex-shrink: 0; }
.btn-breakthrough:hover:not(:disabled) { background: #2a1848; color: #e0b0f0; }
.btn-breakthrough:disabled { opacity: 0.4; cursor: not-allowed; }
.attr-cult-label { font-size: 0.82rem; color: #8a8aaa; margin-bottom: 4px; }
.attr-cult-val { font-size: 0.85rem; color: #c0c0cc; margin-bottom: 6px; }
.attr-cult-bar-wrap { height: 8px; background: #1a1a2e; border-radius: 4px; overflow: hidden; }
.attr-cult-bar { height: 100%; background: linear-gradient(90deg, #9b59b6, #e74c3c); border-radius: 4px; transition: width 0.3s; }
.btn-cultivate {
  background: linear-gradient(135deg, #2c3e50, #3498db);
  color: #fff;
  border: none;
  padding: 6px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9rem;
  font-weight: bold;
}
.cultivate-info {
  color: #8a8aaa;
  font-size: 0.82rem;
}

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
.log-task-updates {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0;
}
.log-task-upd {
  font-size: 0.75rem;
  background: #1a1a2e;
  border: 1px solid #4a3a60;
  color: #b090e0;
  padding: 2px 7px;
  border-radius: 10px;
}
.log-task-upd.upd-done {
  border-color: #60d060;
  color: #60d060;
  background: #0a1a0a;
}

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

/* 任务按钮 */
.btn-task {
  position: relative;
  padding: 5px 12px;
  background: #2a2040;
  border: 1px solid #5a4a80;
  border-radius: 4px;
  color: #c0a0f0;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-task:hover { background: #3a2a50; }
.task-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #e05050;
  color: #fff;
  font-size: 0.65rem;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

/* 任务面板 */
.task-panel {
  width: 480px;
  max-height: 75vh;
  display: flex;
  flex-direction: column;
}
.task-panel-body {
  overflow-y: auto;
  padding: 12px 16px;
  flex: 1;
}
.task-item {
  background: #13131e;
  border: 1px solid #2a2a3e;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.task-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.task-type-badge {
  font-size: 0.72rem;
  padding: 1px 7px;
  border-radius: 10px;
  font-weight: bold;
}
.type-adventurer { background: #3a2a10; color: #f0a040; border: 1px solid #f0a040; }
.type-common     { background: #1a2a1a; color: #60b060; border: 1px solid #60b060; }
.type-main       { background: #1a1a3a; color: #60a0f0; border: 1px solid #60a0f0; }
.type-side       { background: #2a2a1a; color: #c0c060; border: 1px solid #c0c060; }
.task-status-badge {
  font-size: 0.72rem;
  padding: 1px 7px;
  border-radius: 10px;
  margin-left: auto;
}
.status-pending   { background: #1e2a1e; color: #60d060; border: 1px solid #40a040; }
.status-completed { background: #2a2a10; color: #e0c840; border: 1px solid #c0a030; }
.status-claimed   { background: #2a2a2a; color: #888; border: 1px solid #555; }
.task-star-badge {
  color: #ff8c00;
  font-size: 0.78rem;
  letter-spacing: 1px;
}
.task-item-reward {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}
.reward-tag {
  background: #2a2010;
  color: #f0c040;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.78rem;
  border: 1px solid #5a4a20;
}
.task-item-desc {
  font-size: 0.88rem;
  color: #c0c0cc;
  margin-bottom: 8px;
  line-height: 1.5;
}
.task-item-targets {
  margin-bottom: 6px;
}
.task-target-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  padding: 2px 0;
  color: #9090a0;
}
.target-desc { flex: 1; }
.target-progress { margin-left: 8px; }
.progress-done { color: #60d060; font-weight: bold; }
.progress-ing  { color: #e0c840; }
.task-item-nav {
  font-size: 0.8rem;
  color: #60b0f0;
  cursor: pointer;
  text-decoration: underline;
  margin-top: 4px;
}
.task-item-nav:hover { color: #90d0ff; }

/* 交付地点提示 */
.task-item-delivery {
  font-size: 0.8rem;
  color: #60d0a0;
  cursor: pointer;
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  background: #0a1a0a;
  border: 1px solid #40a060;
  text-decoration: underline;
}
.task-item-delivery:hover { color: #90e0c0; border-color: #60c080; }
.task-item-delivery.ready {
  background: #0a1a12;
  border-color: #50c890;
  animation: pulse-green 1.5s ease-in-out infinite;
}
@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 0px rgba(80, 200, 144, 0); }
  50% { box-shadow: 0 0 6px rgba(80, 200, 144, 0.6); }
}
.task-item-delivery-hint {
  font-size: 0.78rem;
  color: #6a7a6a;
  margin-top: 4px;
}

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

/* 任务卡片 */
.task-card {
  margin-top: 10px;
  background: rgba(240, 192, 64, 0.06);
  border: 1px solid rgba(240, 192, 64, 0.25);
  border-radius: 6px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.task-card-title {
  font-size: 0.8rem;
  color: #f0c040;
  font-weight: bold;
  letter-spacing: 0.05rem;
}
.task-card-star {
  color: #ff8c00;
  font-size: 0.85rem;
}
.task-reward-tag {
  background: #2a2010;
  color: #f0c040;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.8rem;
  border: 1px solid #5a4a20;
  margin-right: 4px;
}
.task-card-body {
  font-size: 0.88rem;
  color: #c8c0b0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}
.task-label {
  color: #8a8a9a;
  margin-right: 2px;
}
.task-arrow {
  color: #5a5a6a;
  margin: 0 2px;
}
.task-loc-link {
  color: #60b0f0;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  font-weight: 500;
  transition: color 0.15s;
}
.task-loc-link:hover {
  color: #90d0ff;
}
.task-mob {
  color: #e74c3c;
  font-weight: bold;
}
.task-kill {
  color: #f0a040;
  margin-left: 4px;
}
.task-card-progress {
  font-size: 0.78rem;
  color: #5a5a6a;
}
.task-card-actions {
  margin-top: 4px;
}
.btn-accept-task {
  background: linear-gradient(135deg, #c0a030, #f0c040);
  color: #0a0a0f;
  border: none;
  padding: 5px 18px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: bold;
  transition: opacity 0.2s;
}
.btn-accept-task:hover { opacity: 0.85; }
.btn-accept-task:disabled { opacity: 0.4; cursor: not-allowed; }
.task-accepted-tip {
  font-size: 0.8rem;
  color: #50c080;
  margin-top: 4px;
}
.task-error-tip {
  font-size: 0.8rem;
  color: #e05050;
  margin-top: 4px;
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
.backpack-money {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid #2a2a3a;
  background: #151520;
}
.money-icon { font-size: 1.1rem; }
.money-value {
  color: #f0c040;
  font-weight: bold;
  font-size: 1.1rem;
}
.money-unit {
  color: #8a7e5a;
  font-size: 0.82rem;
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
  cursor: pointer;
  position: relative;
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

/* 物品悬浮信息 */
.item-tooltip {
  position: absolute;
  left: 0;
  right: 0;
  top: 100%;
  z-index: 10;
  background: #1a1a28;
  border: 1px solid #3a3a5a;
  border-radius: 6px;
  padding: 8px 12px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.5);
}
.tooltip-name {
  color: #f0c040;
  font-size: 0.85rem;
  font-weight: bold;
  margin-bottom: 4px;
}
.tooltip-desc {
  color: #a0a0b0;
  font-size: 0.8rem;
  line-height: 1.5;
  margin-bottom: 4px;
}
.tooltip-price {
  color: #f0c040;
  font-size: 0.82rem;
  padding-top: 4px;
  border-top: 1px solid #3a3a5a;
}

/* 交易弹窗 */
.trade-panel { max-height: 80vh; height: 70vh; width: 850px; max-width: 96vw; display: flex; flex-direction: column; }
.trade-body { display: flex; flex: 1; overflow: hidden; }
.trade-side { flex: 1; overflow-y: auto; padding: 12px; }
.trade-npc { border-right: 1px solid #2a2a3a; }
.trade-side-title { font-size: 0.9rem; color: #c0c0cc; font-weight: bold; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #2a2a3a; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: #15151e; z-index: 1; }
.trade-money { font-size: 0.82rem; color: #f0c040; font-weight: normal; }
.trade-empty { color: #5a5a6a; text-align: center; padding: 32px 0; font-size: 0.9rem; }
.trade-item { display: flex; align-items: center; justify-content: space-between; padding: 8px 10px; border-bottom: 1px solid #1e1e2e; transition: background 0.15s; }
.trade-item:hover { background: #1a1a28; }
.trade-item-info { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.ti-name { color: #d0c8b8; font-size: 0.88rem; }
.ti-count { color: #50c878; font-weight: bold; font-size: 0.85rem; }
.ti-sell-price { color: #f0c040; font-size: 0.78rem; background: #2a2010; padding: 1px 6px; border-radius: 8px; }
.btn-sell { padding: 4px 14px; border: 1px solid #50a050; background: #1a2a1a; color: #60d060; border-radius: 4px; cursor: pointer; font-size: 0.82rem; transition: all 0.15s; flex-shrink: 0; }
.btn-sell:hover:not(:disabled) { background: #2a4a2a; color: #80f080; }
.btn-sell:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
