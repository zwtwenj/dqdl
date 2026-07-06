<template>
  <div class="cv-overlay" :style="{ zIndex: cultivationStore.overlayZ }" @click.self="cultivationStore.minimize">
    <div class="cv-box">
      <!-- 最小化（会话继续） -->
      <button class="cv-minimize" @click="cultivationStore.minimize" title="最小化（修炼继续）">&minus;</button>
      <!-- 停止修炼（结算退出） -->
      <button class="cv-stop" @click="cultivationStore.stop">停止修炼</button>

      <div class="cv-header">
        <div class="cv-bronze-line"></div>
        <div class="cv-scene">洞天福地 · {{ '★'.repeat(cultivationStore.star) }}</div>
        <h2 class="cv-title">潜心修炼</h2>
        <div class="cv-progress">
          第 {{ cultivationStore.rounds }} / {{ cultivationStore.maxRounds }} 轮 · 累计
          <span class="cv-total">+{{ cultivationStore.totalGained }}</span> 修为
        </div>
      </div>

      <div class="cv-body">
        <div v-if="cultivationStore.loading" class="cv-empty">灵气汇聚中…</div>
        <div v-else-if="!cultivationStore.events.length" class="cv-empty">
          <div class="spinner-sm"></div>
          <span>吐纳调息中…</span>
        </div>
        <div v-else class="cv-list">
          <div v-for="(ev, i) in cultivationStore.events" :key="i" class="cv-entry" :class="{ 'cv-crit': ev.critical }">
            <span class="cv-entry-gain">+{{ ev.gained }} 修为<template v-if="ev.critical"> · 暴击×3</template><template v-if="ev.capped"> · 已达上限</template></span>
            <span class="cv-entry-meta">第 {{ ev.rounds }}/{{ ev.max_rounds }} 轮</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useCultivationStore } from '../stores/cultivation'
const cultivationStore = useCultivationStore()
</script>

<style scoped>
.cv-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(20, 35, 30, 0.55), rgba(0, 0, 0, 0.92));
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.cv-box {
  position: relative;
  width: 480px;
  max-width: 92vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #0d1612 0%, #0a110e 60%, #080d0b 100%);
  border: 1px solid #4a3a22;
  border-radius: 14px;
  box-shadow: 0 0 0 1px rgba(201, 168, 106, 0.15) inset, 0 0 50px rgba(40, 120, 100, 0.18);
}
.cv-minimize {
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
  font-size: 1.3rem;
  line-height: 1;
  cursor: pointer;
  transition: all 0.2s;
}
.cv-minimize:hover { background: #2a1f12; color: #f0d8a0; }
.cv-stop {
  position: absolute;
  top: 12px;
  right: 54px;
  z-index: 5;
  padding: 5px 14px;
  font-size: 0.78rem;
  letter-spacing: 2px;
  color: #e06060;
  background: rgba(40, 16, 16, 0.5);
  border: 1px solid #6a3030;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
}
.cv-stop:hover { background: #3a2020; color: #f08080; border-color: #8a4040; }

.cv-header {
  position: relative;
  padding: 24px 30px 16px;
  text-align: center;
  border-bottom: 1px solid #1d2e26;
}
.cv-bronze-line {
  position: absolute;
  left: 30px; right: 30px; bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #c9a86a, transparent);
  opacity: 0.5;
}
.cv-scene {
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
.cv-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: normal;
  font-family: "Noto Serif SC", "Songti SC", serif;
  letter-spacing: 8px;
  color: #d4af6a;
  text-shadow: 0 0 14px rgba(201, 168, 106, 0.35);
}
.cv-progress {
  margin-top: 10px;
  font-size: 0.8rem;
  color: #6f8a80;
  letter-spacing: 1px;
}
.cv-total { color: #d4af6a; font-weight: bold; }

.cv-body {
  flex: 1;
  min-height: 120px;
  overflow-y: auto;
  padding: 18px 24px 22px;
}
.cv-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  color: #5a6a60;
  font-size: 0.9rem;
  letter-spacing: 2px;
  padding: 36px 0;
  font-family: "Noto Serif SC", serif;
}
.cv-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.cv-entry {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  background: rgba(20, 40, 34, 0.35);
  border: 1px solid #1e3a32;
  border-left: 3px solid #3e7a66;
  border-radius: 6px;
}
.cv-entry.cv-crit { border-left-color: #f0c040; background: rgba(60, 48, 20, 0.3); }
.cv-entry-gain { color: #a0e0c0; font-size: 0.92rem; }
.cv-entry.cv-crit .cv-entry-gain { color: #f0d070; }
.cv-entry-meta { color: #5a7a6e; font-size: 0.76rem; }
</style>
