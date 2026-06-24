<template>
  <div class="dq-overlay" @click.self="close">
    <div class="dq-box">
      <button class="dq-close" @click="close">&times;</button>

      <div v-if="loading" class="dq-center">
        <div class="dq-seal">境</div>
        <div class="dq-center-text">秘境凝聚中…</div>
      </div>

      <template v-else-if="instance">
        <!-- 头部 -->
        <header class="dq-header">
          <div class="dq-bronze-line"></div>
          <div class="dq-scene">{{ sceneType }}</div>
          <h2 class="dq-title">{{ title }}</h2>
          <div class="dq-progress">
            <span class="dq-stars">{{ '★'.repeat(difficulty) }}</span>
            <span>第 {{ currentAct }} / {{ totalActs }} 幕</span>
          </div>
        </header>

        <!-- 主体 -->
        <div class="dq-main">
          <!-- 左：秘境流程 -->
          <section class="dq-flow">
            <p v-if="intro" class="dq-intro">{{ intro }}</p>

            <div v-if="activeAct" class="dq-stage">
              <div class="dq-act-head">
                <span class="dq-act-title">第{{ currentAct }}幕 · {{ activeAct.title }}</span>
                <span class="dq-act-tag">{{ actTypeLabel(activeAct.type) }}</span>
              </div>
              <p class="dq-narrative">{{ activeAct.narrative }}</p>
              <div v-if="activeAct.reveal" class="dq-reveal">✦ {{ activeAct.reveal }}</div>
            </div>

            <div class="dq-dots">
              <span
                v-for="a in acts"
                :key="a.index"
                class="dq-dot"
                :class="{ done: a.index < currentAct || isCompleted, cur: a.index === currentAct && !isCompleted, boss: a.type === 'boss' }"
              ></span>
            </div>

            <div v-if="isCompleted" class="dq-settle">
              <div class="dq-settle-text">{{ status === 'completed' ? '秘境通关，机缘已得' : '你已撤出秘境，此行收获尽失' }}</div>
              <button class="dq-btn primary" @click="close">离去</button>
            </div>

            <div v-else class="dq-actions">
              <template v-if="activeAct && activeAct.type === 'item'">
                <button class="dq-btn primary" :disabled="acting || activeAct.picked" @click="pick">拾取</button>
                <button class="dq-btn" :disabled="acting" @click="next">前进</button>
              </template>
              <button v-else class="dq-btn primary" :disabled="acting" @click="next">
                {{ isLastAct ? '通关结算' : '前进' }}
              </button>
            </div>
          </section>

          <!-- 右：侧栏 -->
          <aside class="dq-side">
            <div class="dq-tabs">
              <div class="dq-tab" :class="{ on: tab === 'role' }" @click="tab = 'role'">人物</div>
              <div class="dq-tab" :class="{ on: tab === 'pack' }" @click="openPack">行囊</div>
            </div>

            <div class="dq-side-body">
              <!-- 人物 -->
              <div v-if="tab === 'role'" class="dq-role">
                <div class="dq-role-head">
                  <span class="dq-role-name">{{ player?.name }}</span>
                  <span class="dq-role-lv">{{ levelName(player?.level || 1) }}</span>
                </div>
                <div class="dq-vital"><span>气血</span><span>{{ player?.hp ?? 0 }} / {{ player?.final_attrs?.max_hp ?? player?.max_hp ?? 100 }}</span></div>
                <div class="dq-vital"><span>斗气</span><span>{{ player?.energy ?? 0 }} / {{ player?.final_attrs?.max_energy ?? player?.max_energy ?? 100 }}</span></div>
                <div class="dq-attr" v-for="k in baseAttrKeys" :key="k">
                  <span>{{ attrLabels[k] }}</span>
                  <span>{{ player?.final_attrs?.[k] ?? player?.[k] ?? 0 }}</span>
                </div>
                <div class="dq-cult">修为 {{ player?.cultivation ?? 0 }} / {{ player?.level_cultivation ?? 100 }}</div>
              </div>

              <!-- 行囊 -->
              <div v-else class="dq-pack">
                <div v-if="tempItems.length" class="dq-pack-sec">
                  <div class="dq-pack-title">秘境所得 <span>通关方入囊中</span></div>
                  <div class="dq-pack-row" v-for="(it, i) in tempItems" :key="'t' + i">
                    <span class="dq-pn">{{ it.name }}</span>
                    <span class="dq-pc">×{{ it.count }}</span>
                    <button v-if="it.usable" class="dq-use" :disabled="acting" @click="useTemp(it.name)">用</button>
                  </div>
                </div>
                <div class="dq-pack-sec">
                  <div class="dq-pack-title">随身行囊</div>
                  <div v-if="!backpackItems.length" class="dq-empty">囊中空空</div>
                  <div class="dq-pack-row" v-for="(it, i) in backpackItems" :key="'b' + i">
                    <span class="dq-pn">{{ it.name }}</span>
                    <span class="dq-pc">×{{ it.count }}</span>
                    <button v-if="it.usable" class="dq-use" :disabled="acting" @click="useMain(it.name)">用</button>
                  </div>
                </div>
              </div>
            </div>
          </aside>
        </div>
      </template>

      <div v-else class="dq-center">
        <div class="dq-center-text">秘境凝聚失败，请重试</div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useDungeonStore } from '../stores/dungeon'
import { usePlayerStore } from '../stores/player'
import { useBackpackStore } from '../stores/backpack'
import { attrLabels, baseAttrKeys, levelName } from '../game/constants'

const dungeonStore = useDungeonStore()
const playerStore = usePlayerStore()
const backpackStore = useBackpackStore()

const { data: player } = storeToRefs(playerStore)
const { items: backpackItems } = storeToRefs(backpackStore)
const {
  dungeonLoading: loading, acting, instance,
  title, sceneType, difficulty, intro, acts, currentAct, status,
  totalActs, isLastAct, isCompleted, activeAct, tempItems,
} = storeToRefs(dungeonStore)

// 直接解构 action（Pinia 自动绑定 this）
const { next, pick, useTemp, close } = dungeonStore

const tab = ref('role')
function openPack() {
  tab.value = 'pack'
  backpackStore.fetch()
}
function useMain(name) {
  backpackStore.use(name)
}

function actTypeLabel(t) {
  return { combat: '战斗', sneak: '遭遇', modifier: '异变', explore: '探索', item: '机缘', boss: 'BOSS' }[t] || t
}
</script>

<style scoped>
/* ===== 古风暗色修仙风 ===== */
.dq-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(20, 35, 30, 0.55), rgba(0, 0, 0, 0.92));
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}

.dq-box {
  position: relative;
  width: 880px;
  max-width: 95vw;
  max-height: 92vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #0d1612 0%, #0a110e 60%, #080d0b 100%);
  border: 1px solid #4a3a22;
  border-radius: 14px;
  box-shadow: 0 0 0 1px rgba(201, 168, 106, 0.15) inset, 0 0 50px rgba(40, 120, 100, 0.18);
}

.dq-close {
  position: absolute;
  top: 12px;
  right: 14px;
  z-index: 5;
  width: 30px;
  height: 30px;
  border: 1px solid #4a3a22;
  background: rgba(0, 0, 0, 0.3);
  color: #c9a86a;
  border-radius: 50%;
  font-size: 1.1rem;
  cursor: pointer;
  transition: all 0.2s;
}
.dq-close:hover { background: #2a1f12; color: #f0d8a0; }

.dq-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  padding: 70px 0;
  color: #8a9a90;
}
.dq-seal {
  width: 64px; height: 64px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.8rem; font-family: serif;
  color: #0a110e;
  background: linear-gradient(135deg, #d4af6a, #c9a86a);
  border-radius: 10px;
  box-shadow: 0 0 20px rgba(201, 168, 106, 0.4);
  animation: dq-pulse 1.8s ease-in-out infinite;
}
.dq-center-text { font-size: 0.95rem; letter-spacing: 2px; }
@keyframes dq-pulse {
  0%, 100% { box-shadow: 0 0 12px rgba(201, 168, 106, 0.3); }
  50% { box-shadow: 0 0 28px rgba(201, 168, 106, 0.65); }
}

/* 头部 */
.dq-header {
  position: relative;
  padding: 22px 34px 16px;
  text-align: center;
  border-bottom: 1px solid #1d2e26;
}
.dq-bronze-line {
  position: absolute;
  left: 34px; right: 34px; bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #c9a86a, transparent);
  opacity: 0.5;
}
.dq-scene {
  display: inline-block;
  padding: 2px 14px;
  font-size: 0.74rem;
  letter-spacing: 3px;
  color: #6fbfa8;
  background: rgba(30, 74, 62, 0.4);
  border: 1px solid #2a5448;
  border-radius: 3px;
  margin-bottom: 8px;
}
.dq-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: normal;
  font-family: "Noto Serif SC", "Songti SC", "STSong", serif;
  letter-spacing: 4px;
  color: #d4af6a;
  text-shadow: 0 0 14px rgba(201, 168, 106, 0.35);
}
.dq-progress {
  margin-top: 8px;
  font-size: 0.78rem;
  color: #6f8a80;
  letter-spacing: 1px;
}
.dq-stars { color: #d4af6a; letter-spacing: 2px; margin-right: 10px; }

/* 主体两栏 */
.dq-main {
  flex: 1;
  display: flex;
  gap: 0;
  min-height: 0;
}
.dq-flow {
  flex: 1 1 auto;
  min-width: 0;
  padding: 22px 28px;
  overflow-y: auto;
}
.dq-side {
  flex: 0 0 290px;
  display: flex;
  flex-direction: column;
  border-left: 1px solid #1d2e26;
  background: linear-gradient(180deg, #0a1310, #08100d);
}

.dq-intro {
  margin: 0 0 18px;
  padding: 12px 16px;
  font-size: 0.88rem;
  line-height: 1.8;
  color: #9ab0a4;
  border-left: 2px solid #6fbfa8;
  background: rgba(20, 40, 34, 0.25);
  border-radius: 0 6px 6px 0;
}

.dq-stage { margin-bottom: 20px; }
.dq-act-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}
.dq-act-title {
  font-size: 1.02rem;
  color: #e0d8c8;
  font-family: "Noto Serif SC", "Songti SC", serif;
  letter-spacing: 1px;
}
.dq-act-tag {
  font-size: 0.7rem;
  padding: 1px 8px;
  color: #c9a86a;
  border: 1px solid #5a4a2a;
  border-radius: 8px;
  background: rgba(40, 32, 16, 0.4);
}
.dq-narrative {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.9;
  color: #b0c4be;
  text-indent: 2em;
}
.dq-reveal {
  margin-top: 12px;
  padding: 10px 14px;
  font-size: 0.9rem;
  letter-spacing: 1px;
  color: #f0d8a0;
  background: linear-gradient(90deg, rgba(60, 48, 20, 0.5), rgba(20, 16, 8, 0.2));
  border: 1px solid #6a5020;
  border-left: 3px solid #d4af6a;
  border-radius: 4px;
}

.dq-dots {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin: 22px 0;
}
.dq-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  background: #1a2a24;
  border: 1px solid #2a4038;
  transition: all 0.25s;
}
.dq-dot.done { background: #2a5448; border-color: #3a6a58; }
.dq-dot.cur {
  background: #6fbfa8;
  border-color: #8fdac0;
  box-shadow: 0 0 10px rgba(111, 191, 168, 0.7);
  transform: scale(1.2);
}
.dq-dot.boss { width: 14px; height: 14px; border-radius: 3px; }
.dq-dot.boss.cur { background: #d4af6a; border-color: #f0d080; box-shadow: 0 0 12px rgba(212, 175, 106, 0.8); }

.dq-settle { text-align: center; padding: 14px 0; }
.dq-settle-text {
  font-size: 1rem;
  color: #d4af6a;
  font-family: "Noto Serif SC", serif;
  letter-spacing: 2px;
  margin-bottom: 16px;
}

.dq-actions {
  display: flex;
  justify-content: center;
  gap: 14px;
}
.dq-btn {
  min-width: 130px;
  padding: 11px 24px;
  font-size: 0.98rem;
  letter-spacing: 4px;
  color: #8aa89c;
  background: linear-gradient(135deg, #14201c, #101a16);
  border: 1px solid #2a4038;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.dq-btn:hover:not(:disabled) {
  color: #c0e0d0;
  border-color: #3a6a58;
  background: linear-gradient(135deg, #1a2e26, #14241e);
}
.dq-btn.primary {
  color: #d8f0e6;
  background: linear-gradient(135deg, #1e4a3e, #16382e);
  border-color: #3e7a66;
  box-shadow: 0 0 10px rgba(62, 122, 102, 0.25);
}
.dq-btn.primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #266052, #1e483c);
  border-color: #6fbfa8;
  box-shadow: 0 0 16px rgba(111, 191, 168, 0.4);
}
.dq-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* 侧栏 */
.dq-tabs {
  display: flex;
  border-bottom: 1px solid #1d2e26;
}
.dq-tab {
  flex: 1;
  text-align: center;
  padding: 12px 0;
  font-size: 0.92rem;
  letter-spacing: 4px;
  color: #5a7a6e;
  cursor: pointer;
  transition: all 0.2s;
  font-family: "Noto Serif SC", serif;
}
.dq-tab.on {
  color: #d4af6a;
  background: linear-gradient(180deg, rgba(60, 48, 20, 0.25), transparent);
  box-shadow: inset 0 -2px 0 #c9a86a;
}
.dq-side-body {
  flex: 1;
  overflow-y: auto;
  padding: 16px 16px 20px;
}

/* 人物 */
.dq-role-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  padding-bottom: 10px;
  margin-bottom: 12px;
  border-bottom: 1px solid #1a2a24;
}
.dq-role-name { color: #e0d8c8; font-size: 1.05rem; font-family: "Noto Serif SC", serif; letter-spacing: 2px; }
.dq-role-lv { color: #6fbfa8; font-size: 0.78rem; }
.dq-vital, .dq-attr {
  display: flex;
  justify-content: space-between;
  padding: 5px 2px;
  font-size: 0.82rem;
}
.dq-vital { color: #9ab0a4; }
.dq-attr { color: #8aa096; border-top: 1px dashed #16221d; }
.dq-vital span:last-child, .dq-attr span:last-child { color: #d4c4a0; }
.dq-cult {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #1a2a24;
  font-size: 0.76rem;
  color: #5a7a6e;
  text-align: center;
  letter-spacing: 1px;
}

/* 行囊 */
.dq-pack-sec { margin-bottom: 18px; }
.dq-pack-sec:last-child { margin-bottom: 0; }
.dq-pack-title {
  font-size: 0.8rem;
  color: #c9a86a;
  letter-spacing: 2px;
  margin-bottom: 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid #1a2a24;
  font-family: "Noto Serif SC", serif;
}
.dq-pack-title span { color: #5a6a60; font-size: 0.7rem; letter-spacing: 0; }
.dq-pack-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 2px;
  border-bottom: 1px solid #121c18;
}
.dq-pn { flex: 1; color: #c0b8a8; font-size: 0.82rem; }
.dq-pc { color: #6fbfa8; font-size: 0.8rem; }
.dq-use {
  margin-left: auto;
  padding: 2px 12px;
  font-size: 0.76rem;
  color: #6fbfa8;
  background: #14201c;
  border: 1px solid #2a5448;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s;
}
.dq-use:hover:not(:disabled) { background: #1e3830; color: #a0e0c8; border-color: #3e7a66; }
.dq-use:disabled { opacity: 0.35; cursor: not-allowed; }
.dq-empty { color: #4a5a50; font-size: 0.8rem; text-align: center; padding: 14px 0; letter-spacing: 2px; }
</style>
