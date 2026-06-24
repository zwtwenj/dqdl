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
        <button class="btn-task" @click="showTaskPanel = true">任务
          <span v-if="pendingTaskCount > 0" class="task-badge">{{ pendingTaskCount }}</span>
        </button>
        <button class="btn-role" @click="showRole = true">角色</button>
        <button class="btn-skill" @click="showSkillPanel = true">斗技</button>
      </div>
    </div>

    <!-- 角色面板（独立组件） -->
    <RolePanel v-if="showRole" @close="showRole = false" />

    <!-- 地图导航（面包屑） -->
    <div class="breadcrumb">
      <template v-for="(node, idx) in breadcrumb" :key="node.id">
        <span class="sep" v-if="idx > 0"> &gt; </span>
        <span
          v-if="idx < breadcrumb.length - 1"
          class="crumb-link"
          :class="{ disabled: trainingMode }"
          @click="!trainingMode && moveTo(node, idx)"
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
        <button class="btn-train" @click="startAutoTraining" :disabled="trainingMode">
          {{ trainingMode ? '历练中...' : '开始历练' }}
        </button>
        <button class="btn-battle" @click="openBattle" :disabled="trainingMode">
          战斗
        </button>
        <button class="btn-dungeon" @click="openDungeon" :disabled="trainingMode">
          副本
        </button>
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
            :class="{ active: sib.id === currentLocation?.id, 'card-locked': trainingMode }"
            @click="!trainingMode && moveTo(sib, breadcrumb.length - 1)"
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
            :class="{ 'card-locked': trainingMode }"
            @click="!trainingMode && moveTo(child, breadcrumb.length)"
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

    <!-- 任务面板（独立组件） -->
    <TaskPanel v-if="showTaskPanel" @close="showTaskPanel = false" />

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
            <button
              v-if="item.usable"
              class="btn-use"
              :disabled="usingItem"
              @click.stop="usePlayerItem(item.name)"
            >使用</button>
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

    <!-- 斗技面板（独立组件） -->
    <SkillPanel v-if="showSkillPanel" @close="showSkillPanel = false" />

    <!-- 浮动历练卡片 -->
    <div v-if="trainingMode" class="training-float">
      <div class="training-float-header">
        <span class="training-float-title">⚔ 历练中</span>
        <button class="training-float-stop" @click="stopAutoTraining">停止历练</button>
      </div>
      <div class="training-float-body">
        <div class="training-float-empty" v-if="!trainingEvents.length">
          <div class="spinner-sm"></div>
          <span>探寻魔兽中...</span>
        </div>
        <div
          v-for="(evt, idx) in trainingEvents"
          :key="idx"
          class="float-log-entry"
          :class="{ 'float-log-lost': evt.won === false }"
        >
          <p class="float-log-text">{{ evt.text }}</p>
          <div class="float-log-drops" v-if="evt.drops && evt.drops.length">
            🎁 <span class="float-drop-item" v-for="(d, di) in evt.drops" :key="di">{{ d.name }}&times;{{ d.count }}<template v-if="di < evt.drops.length - 1">，</template></span>
          </div>
          <div class="float-log-task" v-if="evt.task_updates && evt.task_updates.length">
            <span
              v-for="(upd, ui) in evt.task_updates"
              :key="ui"
              class="float-task-upd"
              :class="{ 'upd-done': upd.done }"
            >
              📋 {{ upd.description.slice(0, 14) }}… {{ upd.current }}/{{ upd.required }}
              <span v-if="upd.done"> ✔</span>
            </span>
          </div>
          <span class="float-log-meta" v-if="evt.battle">
            {{ evt.timestamp }}&nbsp;·&nbsp;{{ evt.mob?.name }}&nbsp;·&nbsp;{{ evt.won === false ? '逃跑' : evt.battle?.style }}&nbsp;·&nbsp;胜率{{ evt.battle?.win_rate }}%
          </span>
        </div>
      </div>
    </div>

    <!-- 战斗界面 -->
    <div class="battle-overlay" v-if="showBattle">
      <div class="battle-box">
        <button class="battle-close" @click="closeBattle">&times;</button>
        <div class="battle-field" v-if="!battleLoading">
          <div class="battle-side player-side">
            <div class="battle-bars">
              <div class="battle-bar-row">
                <span class="battle-bar-label">生命</span>
                <div class="battle-bar-wrap"><div class="battle-bar-fill hp-fill" :style="{ width: Math.max(2, (battlePlayerHp / playerMaxHp) * 100) + '%' }"></div></div>
                <span class="battle-bar-val hp-val">{{ battlePlayerHp }}/{{ playerMaxHp }}</span>
              </div>
              <div class="battle-bar-row">
                <span class="battle-bar-label">斗气</span>
                <div class="battle-bar-wrap"><div class="battle-bar-fill energy-fill" :style="{ width: Math.max(2, (battlePlayerEnergy / playerMaxEnergy) * 100) + '%' }"></div></div>
                <span class="battle-bar-val energy-val">{{ battlePlayerEnergy }}/{{ playerMaxEnergy }}</span>
              </div>
            </div>
            <div class="battle-avatar player-avatar">
              <img src="./assets/hero.png" class="battle-img" />
            </div>
            <div class="battle-info">
              <div class="battle-name">{{ battlePlayerName }}</div>
              <div class="battle-level">{{ levelName(battlePlayerLevel) }}</div>
            </div>
          </div>

          <div class="battle-vs">VS</div>

          <div class="battle-side mob-side">
            <div class="battle-bars">
              <div class="battle-bar-row">
                <span class="battle-bar-label">生命</span>
                <div class="battle-bar-wrap"><div class="battle-bar-fill hp-fill" :style="{ width: Math.max(2, (battleMobHp / mobMaxHp) * 100) + '%' }"></div></div>
                <span class="battle-bar-val hp-val">{{ battleMobHp }}/{{ mobMaxHp }}</span>
              </div>
            </div>
            <div class="battle-avatar mob-avatar">
              <div class="battle-img-dummy">?</div>
            </div>
            <div class="battle-info">
              <div class="battle-name">{{ battleMobName }}</div>
              <div class="battle-level">{{ battleMobRank }} · Lv.{{ battleMobLevel }}</div>
            </div>
          </div>
        </div>
        <div class="battle-actions">
          <button class="battle-btn battle-btn-attack" :disabled="battleOver || attacking" @click="battleAttack">攻击</button>
          <div class="battle-skill-slots">
            <div
              v-for="(sk, idx) in equippedSkills"
              :key="sk.id"
              class="battle-skill-slot filled"
              :class="{ 'skill-disabled': battleOver || attacking || (battlePlayerEnergy || 0) < sk.energyCost }"
              @click="battleSkill(idx)"
            >
              <span class="bss-name">{{ sk.name }}</span>
              <span class="bss-cost">斗气{{ sk.energyCost }}</span>
            </div>
            <div
              v-for="slot in 5 - equippedSkills.length"
              class="battle-skill-slot"
            >
              <span class="bss-empty">空槽</span>
            </div>
          </div>
          <button class="battle-btn battle-btn-run" :disabled="attacking" @click="battleFlee">逃跑</button>
        </div>
        <div class="battle-log" v-if="battleLog.length">
          <div class="battle-log-entry" v-for="(msg, idx) in battleLog" :key="idx">{{ msg }}</div>
        </div>
        <div class="battle-loading" v-if="battleLoading">加载中...</div>
      </div>
    </div>

    <!-- 副本界面（独立组件） -->
    <DungeonPanel v-if="showDungeon" />
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
import { useBattleStore } from './stores/battle'
import { useDungeonStore } from './stores/dungeon'
import DungeonPanel from './components/DungeonPanel.vue'
import RolePanel from './components/RolePanel.vue'
import TaskPanel from './components/TaskPanel.vue'
import SkillPanel from './components/SkillPanel.vue'
import { attrLabels, baseAttrKeys, levelName } from './game/constants'

const playerStore = usePlayerStore()
const mapStore = useMapStore()
const dialogStore = useDialogStore()
const backpackStore = useBackpackStore()
const taskStore = useTaskStore()
const gameStore = useGameStore()
const battleStore = useBattleStore()
const dungeonStore = useDungeonStore()

const { data: player } = storeToRefs(playerStore)
const { loading: playerLoading, loadingText: playerLoadingText } = storeToRefs(playerStore)
const { breadcrumb, currentLocation, currentChildren, currentNpcs, currentSiblings, loading: mapLoading, loadingText: mapLoadingText } = storeToRefs(mapStore)
const { npc: dialogNpc, history: dialogHistory, loading: dialogLoading } = storeToRefs(dialogStore)
const { items: backpackItems, showPanel: showBackpack, showTrade, tradeSelling, usingItem } = storeToRefs(backpackStore)
const { list: tasks, loading: taskLoading } = storeToRefs(taskStore)
const { started: gameStarted, trainingLog, cultivationLog, trainingLoading, trainingMode, trainingEvents } = storeToRefs(gameStore)
const { showBattle, battleLoading, mob, playerName: battlePlayerName, playerLevel: battlePlayerLevel, playerHp: battlePlayerHp, playerMaxHp, playerEnergy: battlePlayerEnergy, playerMaxEnergy, mobName: battleMobName, mobLevel: battleMobLevel, mobRank: battleMobRank, mobMaxHp, mobHp: battleMobHp, equippedSkills, battleLog, battleOver, attacking } = storeToRefs(battleStore)
const { showDungeon } = storeToRefs(dungeonStore)

const loading = computed(() => playerStore.loading || playerLoading.value || mapLoading.value)
const loadingText = computed(() => mapLoadingText.value || playerLoadingText.value)
const hasSave = computed(() => gameStore.hasSave())

function newGame() { gameStore.newGame() }
function continueGame() { gameStore.continueGame() }
function moveTo(loc, idx) {
  if (trainingMode.value) return
  mapStore.moveTo(loc, idx); dialogStore.close()
}
function openDialog(npc) { dialogStore.open(npc) }
function closeDialog() { dialogStore.close() }
function sendDialog(msg) { dialogStore.send(msg) }
function handleEventClick(evt) { dialogStore.handleEvent(evt) }
function toggleBackpack() { backpackStore.toggle() }
function closeTrade() { backpackStore.closeTrade() }
function sellPlayerItem(name, count) { backpackStore.sell(name, count) }
function usePlayerItem(name) { backpackStore.use(name) }
function acceptCurrentTask(card) { taskStore.acceptCurrentTask(card) }
function navigateToLocation(locId) {
  if (trainingMode.value) return
  mapStore.navigateToLocation(locId); dialogStore.close()
}
function navigateToTask(path) { if (path?.length) navigateToLocation(path[path.length - 1].id) }
function doTrainingEvent() { gameStore.doTrainingEvent() }
function startAutoTraining() { gameStore.startAutoTraining() }
function stopAutoTraining() { gameStore.stopAutoTraining() }
function openBattle() { battleStore.open() }
function closeBattle() { battleStore.close() }
function battleAttack() { battleStore.playerAttack() }
function battleSkill(idx) { battleStore.skillAttack(idx) }
function battleFlee() { battleStore.flee() }
function openDungeon() { dungeonStore.enter() }

function doCultivate() { gameStore.doCultivate() }

const dialogInput = ref('')
function handleSend() { const msg = dialogInput.value.trim(); if (!msg || dialogLoading.value) return; dialogInput.value = ''; sendDialog(msg) }

const showTaskPanel = ref(false)
const pendingTaskCount = computed(() => tasks.value.filter(t => t.status === 'pending').length)

const showRole = ref(false)
const activeTooltip = ref(-1)
function toggleItemTooltip(idx) { activeTooltip.value = activeTooltip.value === idx ? -1 : idx }

const showSkillPanel = ref(false)

function typeLabel(type) { return {continent:'大陆',region:'区域',empire:'帝国',city:'城市',wild:'野外',wild2:'野外深处',wild3:'野外核心',sect:'宗派',secret:'秘境',district:'区域',scene:'场景'}[type]||type }
function dangerLabel(level) { return {1:'一阶(低危)',2:'二阶(中危)',3:'三阶(高危)'}[level]||level }
function parseMobs(raw) { try { const a = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(a) ? a : [] } catch { return [] } }
</script>

<style>
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
  z-index: 3000;
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

/* 生命斗气 */
.attr-vital {
  display: flex;
  gap: 12px;
  padding: 12px 0;
  border-bottom: 1px solid #2a2a3e;
  margin-bottom: 4px;
}
.vital-item {
  flex: 1;
  background: #0e0e1a;
  border: 1px solid #222244;
  border-radius: 8px;
  padding: 10px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.vital-label {
  color: #8a8a9a;
  font-size: 0.85rem;
}
.vital-val {
  color: #e0c878;
  font-weight: bold;
  font-size: 1.05rem;
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
.btn-use { padding: 4px 14px; border: 1px solid #5070a0; background: #1a2a3a; color: #60a0e0; border-radius: 4px; cursor: pointer; font-size: 0.82rem; transition: all 0.15s; flex-shrink: 0; margin-left: auto; }
.btn-use:hover:not(:disabled) { background: #2a3a5a; color: #80c0f0; }
.btn-use:disabled { opacity: 0.4; cursor: not-allowed; }

/* 斗技按钮 */
.btn-skill {
  background: #3a2020;
  color: #e08060;
  border: 1px solid #7a4a40;
  padding: 4px 14px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.85rem;
}
.btn-skill:hover { background: #4a3028; }

/* 斗技弹窗 */
.skill-panel {
  width: 460px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.skill-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}
.skill-slots-title,
.skill-inventory-title {
  font-size: 0.85rem;
  color: #a0a0b0;
  margin-bottom: 10px;
  letter-spacing: 0.05rem;
}
.skill-slots-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.skill-slot {
  width: 64px;
  height: 64px;
  background: #151520;
  border: 2px dashed #3a3a4a;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.skill-slot.occupied {
  border-style: solid;
  border-color: #7a4a40;
  background: #2a1a18;
}
.skill-slot:hover {
  border-color: #e08060;
  background: #2a1a18;
}
.skill-slot-empty {
  color: #4a4a5a;
  font-size: 1.2rem;
  font-weight: bold;
}
.skill-inventory-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 80px;
}
.skill-item {
  width: 64px;
  height: 80px;
  background: #1a1a28;
  border: 1px solid #3a3a4a;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: grab;
  transition: all 0.15s;
}
.skill-item:hover {
  border-color: #e08060;
  background: #252232;
}
.skill-item:active { cursor: grabbing; }
.skill-icon {
  width: 36px;
  height: 36px;
  background: #3a3020;
  border: 1px solid #5a4a30;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #f0c040;
  font-weight: bold;
  font-size: 0.95rem;
}
.skill-name {
  margin-top: 6px;
  font-size: 0.72rem;
  color: #c0c0cc;
  max-width: 58px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.skill-lv {
  font-size: 0.7rem;
  color: #888;
  margin-top: 2px;
}
.skill-empty {
  color: #5a5a6a;
  font-size: 0.85rem;
  padding: 16px 0;
  text-align: center;
  width: 100%;
}

/* ===== 历练锁定态 ===== */
.crumb-link.disabled {
  color: #555;
  cursor: not-allowed;
  pointer-events: none;
}
.card-locked {
  opacity: 0.4;
  cursor: not-allowed;
  pointer-events: none;
}

/* ===== 战斗按钮 ===== */
.btn-battle {
  background: linear-gradient(135deg, #2a1030, #3a1840);
  border: 1px solid #6a3880;
  color: #c060e0;
  padding: 8px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
  transition: all 0.2s;
  margin-left: 10px;
}
.btn-battle:hover:not(:disabled) {
  background: linear-gradient(135deg, #3a1840, #4a2060);
  border-color: #9050b0;
}
.btn-battle:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ===== 副本按钮 ===== */
.btn-dungeon {
  background: linear-gradient(135deg, #102a2a, #18403a);
  border: 1px solid #388070;
  color: #40c0a0;
  padding: 8px 20px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 0.95rem;
  transition: all 0.2s;
  margin-left: 10px;
}
.btn-dungeon:hover:not(:disabled) {
  background: linear-gradient(135deg, #184040, #206050);
  border-color: #50b090;
}
.btn-dungeon:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* ===== 副本界面 ===== */
.dungeon-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.dungeon-box {
  width: 840px;
  max-width: 95vw;
  max-height: 92vh;
  overflow-y: auto;
  background: linear-gradient(160deg, #0a1a18, #0c1c28);
  border: 1px solid #2a5a4a;
  border-radius: 16px;
  box-shadow: 0 0 60px rgba(40, 120, 100, 0.2);
  padding: 36px 30px 28px;
  position: relative;
}
.dungeon-loading {
  text-align: center;
  color: #6a8a7a;
  padding: 40px 0;
}
.dungeon-header {
  text-align: center;
  margin-bottom: 18px;
}
.dungeon-scene-tag {
  display: inline-block;
  font-size: 0.78rem;
  color: #40c0a0;
  border: 1px solid #2a5a4a;
  border-radius: 12px;
  padding: 2px 12px;
  margin-bottom: 8px;
}
.dungeon-title {
  font-size: 1.4rem;
  font-weight: bold;
  color: #d0e8e0;
  letter-spacing: 2px;
}
.dungeon-progress {
  font-size: 0.82rem;
  color: #6a8a7a;
  margin-top: 4px;
}
.dungeon-intro {
  color: #8a9a90;
  font-style: italic;
  font-size: 0.9rem;
  line-height: 1.6;
  border-left: 2px solid #2a5a4a;
  padding: 6px 12px;
  margin-bottom: 18px;
}
.dungeon-stage {
  background: rgba(20, 40, 36, 0.5);
  border: 1px solid #1f3a34;
  border-radius: 10px;
  padding: 18px 20px;
  margin-bottom: 16px;
}
.dungeon-act-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.dungeon-act-title {
  color: #c0d8d0;
  font-size: 1.02rem;
  font-weight: bold;
}
.dungeon-act-type {
  font-size: 0.75rem;
  color: #40c0a0;
  border: 1px solid #2a5a4a;
  border-radius: 10px;
  padding: 1px 8px;
}
.dungeon-narrative {
  color: #b0c4be;
  font-size: 0.95rem;
  line-height: 1.7;
}
.dungeon-stars { color: #f0c040; letter-spacing: 1px; margin-right: 6px; }
.dungeon-reveal { margin-top: 12px; padding: 10px 14px; background: linear-gradient(90deg, #2a2010, #1a1408); border: 1px solid #6a5020; border-left: 3px solid #f0c040; border-radius: 6px; color: #f0d070; font-size: 0.95rem; letter-spacing: 0.5px; }
/* 副本主体两栏 */
.dungeon-main { display: flex; gap: 18px; align-items: stretch; }
.dungeon-flow { flex: 1 1 auto; min-width: 0; }
.dungeon-side { flex: 0 0 300px; display: flex; flex-direction: column; background: #0c1410; border: 1px solid #1e3a32; border-radius: 10px; overflow: hidden; }
.side-tabs { display: flex; border-bottom: 1px solid #1e3a32; }
.side-tab { flex: 1; text-align: center; padding: 9px 0; font-size: 0.88rem; color: #6f9a8a; cursor: pointer; transition: all 0.15s; }
.side-tab.active { color: #d0f0e0; background: #14302a; border-bottom: 2px solid #40c0a0; }
.side-body { padding: 12px; overflow-y: auto; max-height: 60vh; }
.side-role-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #1c3028; }
.side-role-name { color: #e0d8c8; font-size: 1rem; font-weight: bold; }
.side-role-level { color: #40c0a0; font-size: 0.78rem; }
.side-vital-row { display: flex; justify-content: space-between; font-size: 0.8rem; color: #9fc8b8; padding: 3px 0; }
.side-attr { display: flex; justify-content: space-between; font-size: 0.8rem; color: #9fc8b8; padding: 3px 0; border-top: 1px dashed #1c3028; }
.side-attr-label { color: #7a9a8a; }
.side-attr-val { color: #d0c8b8; }
.side-cult { margin-top: 8px; padding-top: 8px; border-top: 1px solid #1c3028; font-size: 0.78rem; color: #6f9a8a; }
.side-section { margin-bottom: 14px; }
.side-section:last-child { margin-bottom: 0; }
.side-section-title { font-size: 0.8rem; color: #8aa89c; margin-bottom: 6px; }
.side-section-hint { color: #5a7a6e; font-size: 0.72rem; }
.side-item { display: flex; align-items: center; gap: 6px; padding: 5px 2px; border-bottom: 1px solid #16221d; }
.side-item:last-child { border-bottom: none; }
.side-item-name { color: #d0c8b8; font-size: 0.82rem; flex: 1; }
.side-item-count { color: #50c878; font-size: 0.8rem; }
.side-empty { color: #5a7a6e; font-size: 0.8rem; padding: 8px 0; text-align: center; }
.dungeon-dots {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 18px;
}
.dungeon-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #1a2a26;
  border: 1px solid #2a4a44;
}
.dungeon-dot.done {
  background: #2a6a58;
  border-color: #40a088;
}
.dungeon-dot.cur {
  background: #40c0a0;
  border-color: #60e0c0;
  box-shadow: 0 0 8px rgba(64, 192, 160, 0.6);
}
.dungeon-dot.boss {
  width: 18px;
  height: 18px;
  border-radius: 3px;
}
.dungeon-actions {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 12px;
}
.dungeon-settle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.dungeon-btn {
  min-width: 128px;
  padding: 11px 24px;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid;
}
.dungeon-btn-primary {
  background: linear-gradient(135deg, #18403a, #206050);
  border-color: #40a088;
  color: #d0f0e8;
}
.dungeon-btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #206050, #2a8068);
}
.dungeon-btn-escape {
  background: transparent;
  border-color: #5a3a3a;
  color: #a07070;
  width: 50%;
  padding: 8px 0;
  font-size: 0.88rem;
}
.dungeon-btn-escape:hover:not(:disabled) {
  background: rgba(80, 40, 40, 0.3);
}
.dungeon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dungeon-settle-text {  color: #c0d8d0;
  font-size: 1rem;
  margin-bottom: 6px;
}

/* ===== 战斗界面 ===== */
.battle-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.battle-box {
  width: 700px;
  max-width: 95vw;
  background: linear-gradient(160deg, #0c0c18, #141428);
  border: 1px solid #3a3a5a;
  border-radius: 16px;
  box-shadow: 0 0 60px rgba(100,40,180,0.2);
  overflow: hidden;
  position: relative;
}
.battle-close {
  position: absolute;
  top: 10px;
  right: 14px;
  background: none;
  border: none;
  color: #6a6a8a;
  font-size: 1.5rem;
  cursor: pointer;
  z-index: 1;
}
.battle-field {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 40px 30px 20px;
  gap: 24px;
}
.battle-side {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}
.battle-avatar {
  width: 120px;
  height: 120px;
  border-radius: 50%;
  overflow: hidden;
  border: 3px solid #3a3a5a;
  background: #1a1a28;
}
.player-avatar { border-color: #5080c0; }
.mob-avatar { border-color: #c05050; }
.battle-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.battle-img-dummy {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 3rem;
  color: #c05050;
  background: #1a1018;
}
.battle-info {
  text-align: center;
}
.battle-name {
  color: #e0e0e8;
  font-weight: bold;
  font-size: 1.1rem;
}
.battle-level {
  color: #8a8a9a;
  font-size: 0.85rem;
  margin-top: 2px;
}
.battle-bars {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 4px;
}
.battle-bar-row {
  display: flex;
  align-items: center;
  gap: 6px;
}
.battle-bar-label {
  color: #7a7a8a;
  font-size: 0.72rem;
  width: 28px;
  flex-shrink: 0;
  text-align: right;
}
.battle-bar-wrap {
  flex: 1;
  height: 12px;
  background: #151522;
  border: 1px solid #2a2a3e;
  border-radius: 6px;
  overflow: hidden;
}
.battle-bar-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.4s;
}
.hp-fill { background: linear-gradient(90deg, #30a050, #50d878); }
.energy-fill { background: linear-gradient(90deg, #3050a0, #5078d0); }
.battle-bar-val {
  font-size: 0.78rem;
  font-weight: bold;
  width: 32px;
  flex-shrink: 0;
  text-align: left;
}
.hp-val { color: #50d878; }
.energy-val { color: #5078d0; }
.battle-desc {
  color: #7a7a8a;
  font-size: 0.78rem;
  margin-top: 6px;
  max-width: 200px;
}
.battle-vs {
  color: #c0a040;
  font-size: 1.8rem;
  font-weight: bold;
  text-shadow: 0 0 12px rgba(240,192,64,0.4);
  flex-shrink: 0;
}
.battle-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  padding: 16px 30px 24px;
  border-top: 1px solid #1e1e30;
}
.battle-btn {
  padding: 10px 32px;
  border-radius: 8px;
  border: 1px solid #3a3a5a;
  background: #1e1e30;
  color: #a0a0b0;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}
.battle-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.battle-btn-attack { border-color: #5078a0; color: #6098d0; }
.battle-btn-skill { border-color: #9060a0; color: #a080c0; }
.battle-btn-run { border-color: #906050; color: #c08060; }
.battle-skill-slots {
  display: flex;
  gap: 6px;
}
.battle-skill-slot {
  width: 72px;
  padding: 8px 6px;
  background: #12121e;
  border: 1px solid #2a2a40;
  border-radius: 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transition: all 0.2s;
}
.battle-skill-slot.filled {
  border-color: #605080;
  background: #1a1428;
  cursor: pointer;
}
.battle-skill-slot.filled:hover:not(.skill-disabled) {
  border-color: #8068a0;
  background: #221a32;
}
.battle-skill-slot.skill-disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.bss-name {
  color: #c0a0e0;
  font-size: 0.72rem;
  font-weight: bold;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 66px;
}
.bss-cost {
  color: #706090;
  font-size: 0.65rem;
}
.bss-empty {
  color: #3a3a4a;
  font-size: 0.7rem;
}
.battle-loading {
  text-align: center;
  padding: 60px 0;
  color: #6a6a8a;
  font-size: 1rem;
}
.battle-log {
  max-height: 120px;
  overflow-y: auto;
  padding: 10px 30px;
  border-top: 1px solid #1e1e30;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.battle-log-entry {
  color: #a0a0b8;
  font-size: 0.82rem;
  padding: 4px 0;
}

/* ===== 浮动历练卡片 ===== */
.training-float {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 360px;
  max-height: 480px;
  background: linear-gradient(145deg, #12121c, #1a1a2e);
  border: 1px solid #3a3a5a;
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(240,192,64,0.15);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  overflow: hidden;
}
.training-float-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a3e;
  background: rgba(240,192,64,0.06);
}
.training-float-title {
  color: #f0c040;
  font-weight: bold;
  font-size: 0.95rem;
}
.training-float-stop {
  background: #3a2020;
  border: 1px solid #6a3030;
  color: #e06060;
  padding: 4px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}
.training-float-stop:hover {
  background: #5a2828;
  border-color: #8a4040;
}
.training-float-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 60px;
}
.training-float-body::-webkit-scrollbar {
  width: 4px;
}
.training-float-body::-webkit-scrollbar-thumb {
  background: #3a3a5a;
  border-radius: 2px;
}
.training-float-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
  color: #6a6a8a;
  font-size: 0.85rem;
}
.spinner-sm {
  width: 20px;
  height: 20px;
  border: 2px solid #3a3a4a;
  border-top-color: #f0c040;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.float-log-entry {
  padding: 10px 12px;
  background: #0e0e18;
  border: 1px solid #1e1e30;
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.5;
}
.float-log-lost {
  border-color: #3a2020;
  background: #120a0a;
}
.float-log-text {
  color: #d0d0dc;
  margin: 0 0 4px 0;
}
.float-log-drops {
  color: #50c878;
  font-size: 0.78rem;
  margin-top: 2px;
}
.float-drop-item {
  color: #60d888;
}
.float-log-task {
  margin-top: 2px;
  font-size: 0.76rem;
}
.float-task-upd {
  display: block;
  color: #90a0c0;
}
.float-task-upd.upd-done {
  color: #50c878;
}
.float-log-meta {
  display: block;
  margin-top: 4px;
  color: #6a6a8a;
  font-size: 0.74rem;
}
</style>
