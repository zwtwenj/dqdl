<template>
  <div class="enc-overlay" :style="{ zIndex: encounterStore.overlayZ }" @click.self="encounterStore.close">
    <div class="enc-box">
      <button class="enc-close" @click="encounterStore.close">&times;</button>

      <div class="enc-header">
        <div class="enc-bronze-line"></div>
        <h2 class="enc-title">奇遇</h2>
        <div class="enc-sub">历练途中所得机缘 · 最多累计 10 次</div>
      </div>

      <div class="enc-body">
        <div v-if="encounterStore.loading" class="enc-empty">机缘凝聚中…</div>
        <div v-else-if="!encounterStore.list.length" class="enc-empty">尚未触发奇遇，于野外历练时或有发现。</div>
        <div v-else class="enc-list">
          <div v-for="en in encounterStore.list" :key="en.id" class="enc-card" :class="{ 'is-active': en.status === 'entered' }">
            <div class="enc-card-head">
              <span class="enc-card-scene">{{ cardScene(en) }}</span>
              <span class="enc-card-title">{{ en.title }}</span>
              <span v-if="en.status === 'entered'" class="enc-card-badge">{{ en.kind === 'cultivate' ? '修炼中' : '进行中' }}</span>
            </div>
            <p class="enc-card-desc">{{ en.description }}</p>
            <div class="enc-card-actions">
              <template v-if="en.status === 'entered'">
                <button class="enc-btn primary" @click="encounterStore.enter(en.id)">继续</button>
              </template>
              <template v-else>
                <button class="enc-btn primary" @click="encounterStore.enter(en.id)">进入</button>
                <button class="enc-btn" @click="encounterStore.abandon(en.id)">放弃</button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useEncounterStore } from '../stores/encounter'
const encounterStore = useEncounterStore()
function cardScene(en) {
  if (en.kind === 'cultivate') return (en.star || 1) + '星洞天'
  return en.scene_type
}
</script>

<style scoped>
.enc-overlay {
  position: fixed;
  inset: 0;
  background: radial-gradient(ellipse at center, rgba(20, 35, 30, 0.55), rgba(0, 0, 0, 0.92));
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.enc-box {
  position: relative;
  width: 560px;
  max-width: 92vw;
  max-height: 82vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(160deg, #0d1612 0%, #0a110e 60%, #080d0b 100%);
  border: 1px solid #4a3a22;
  border-radius: 14px;
  box-shadow: 0 0 0 1px rgba(201, 168, 106, 0.15) inset, 0 0 50px rgba(40, 120, 100, 0.18);
}
.enc-close {
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
.enc-close:hover { background: #2a1f12; color: #f0d8a0; }

.enc-header {
  position: relative;
  padding: 22px 30px 16px;
  text-align: center;
  border-bottom: 1px solid #1d2e26;
}
.enc-bronze-line {
  position: absolute;
  left: 30px; right: 30px; bottom: -1px;
  height: 1px;
  background: linear-gradient(90deg, transparent, #c9a86a, transparent);
  opacity: 0.5;
}
.enc-title {
  margin: 0;
  font-size: 1.5rem;
  font-weight: normal;
  font-family: "Noto Serif SC", "Songti SC", serif;
  letter-spacing: 8px;
  color: #d4af6a;
  text-shadow: 0 0 14px rgba(201, 168, 106, 0.35);
}
.enc-sub {
  margin-top: 8px;
  font-size: 0.76rem;
  color: #5a7a6e;
  letter-spacing: 1px;
}

.enc-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 18px 22px 22px;
}
.enc-empty {
  text-align: center;
  color: #5a6a60;
  font-size: 0.9rem;
  letter-spacing: 2px;
  padding: 48px 0;
  font-family: "Noto Serif SC", serif;
}

.enc-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.enc-card {
  padding: 14px 16px;
  background: linear-gradient(160deg, rgba(20, 40, 34, 0.4), rgba(12, 22, 18, 0.3));
  border: 1px solid #1e3a32;
  border-left: 3px solid #6fbfa8;
  border-radius: 8px;
}
.enc-card-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}
.enc-card-scene {
  padding: 2px 10px;
  font-size: 0.72rem;
  letter-spacing: 2px;
  color: #6fbfa8;
  background: rgba(30, 74, 62, 0.4);
  border: 1px solid #2a5448;
  border-radius: 3px;
}
.enc-card.is-active { border-left-color: #f0c040; }
.enc-card-badge {
  margin-left: auto;
  padding: 2px 10px;
  font-size: 0.7rem;
  letter-spacing: 1px;
  color: #f0c040;
  background: rgba(60, 48, 20, 0.4);
  border: 1px solid #6a5020;
  border-radius: 10px;
}
.enc-card-title {
  font-size: 1rem;
  color: #e0d8c8;
  font-family: "Noto Serif SC", serif;
  letter-spacing: 1px;
}
.enc-card-desc {
  margin: 0 0 12px;
  font-size: 0.88rem;
  line-height: 1.8;
  color: #9ab0a4;
}
.enc-card-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}
.enc-btn {
  padding: 6px 18px;
  font-size: 0.84rem;
  letter-spacing: 3px;
  color: #8aa89c;
  background: linear-gradient(135deg, #14201c, #101a16);
  border: 1px solid #2a4038;
  border-radius: 5px;
  cursor: pointer;
  transition: all 0.2s;
}
.enc-btn:hover:not(:disabled) {
  color: #c0e0d0;
  border-color: #3a6a58;
}
.enc-btn.primary {
  color: #d8f0e6;
  background: linear-gradient(135deg, #1e4a3e, #16382e);
  border-color: #3e7a66;
}
.enc-btn.primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #266052, #1e483c);
  border-color: #6fbfa8;
  box-shadow: 0 0 12px rgba(111, 191, 168, 0.35);
}
</style>
