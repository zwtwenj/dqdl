<template>
  <div class="tbg-overlay" @contextmenu.prevent>
    <div class="tbg-box">
      <div class="tbg-header">
        <span class="tbg-title">功法突破 · {{ technique?.name }}</span>
        <button class="tbg-x" @click="giveUp">&times;</button>
      </div>

      <!-- 结算视图 -->
      <div v-if="store.result" class="tbg-result" :class="{ ok: store.result.success, fail: !store.result.success }">
        <div class="tbg-result-title">{{ store.result.success ? '突破成功' : '突破失败' }}</div>
        <p class="tbg-result-text">{{ store.result.narrative }}</p>
        <button class="tbg-result-btn" @click="store.close()">确认</button>
      </div>

      <!-- 游戏视图 -->
      <template v-else>
        <div class="tbg-meta">
          <div class="tbg-rate">
            <span class="tbg-rate-label">成功率</span>
            <span class="tbg-rate-val" :class="{ full: rate >= 100 }">{{ Math.round(rate) }}%</span>
          </div>
          <div class="tbg-rate-bar"><div class="tbg-rate-fill" :style="{ width: rate + '%' }"></div></div>
          <div class="tbg-time">剩余 {{ timeLeft }}s</div>
        </div>
        <div class="tbg-hint">左键「功」+2%　左键「魔」-2%　右键击碎「魔」可避免逸出扣分　「魔」逸出边缘 -2%</div>

        <div class="tbg-arena" ref="arenaRef">
          <div class="tbg-center"></div>
          <div
            v-for="b in bubbles"
            :key="b.id"
            class="tbg-bubble"
            :class="'is-' + b.kind"
            :style="{ left: b.x + 'px', top: b.y + 'px' }"
            @click="onLeft(b)"
            @contextmenu.prevent="onRight(b)"
          >{{ b.kind }}</div>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useTechniqueBreakthroughStore } from '../stores/techniqueBreakthrough'
import { usePlayerStore } from '../stores/player'
import { breakthroughTechnique } from '../api'

const store = useTechniqueBreakthroughStore()
const playerStore = usePlayerStore()
const technique = store.technique

// 竞技场（与样式同步：600 x 360）
const W = 600, H = 360, CX = W / 2, CY = H / 2, R = 26
const TOTAL = 30, MIN_GONG = 10, DURATION = 30
const BASE_RATE = Number(technique?.breakthrough_rate) || 50

const bubbles = ref([])
const rate = ref(BASE_RATE)
const timeLeft = ref(DURATION)
let spawned = 0
let finished = false
let nextId = 1
let pool = []

let rafId = null, lastTs = 0
let spawnTimer = null, tickTimer = null

function makePool() {
  const p = Array.from({ length: TOTAL }, () => (Math.random() < 0.5 ? '功' : '魔'))
  let gong = p.filter((k) => k === '功').length
  while (gong < MIN_GONG) {
    const idx = p.findIndex((k) => k === '魔')
    if (idx < 0) break
    p[idx] = '功'; gong++
  }
  for (let i = p.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[p[i], p[j]] = [p[j], p[i]]
  }
  return p
}

function spawnOne() {
  if (spawned >= TOTAL) return
  const kind = pool[spawned++]
  const angle = Math.random() * Math.PI * 2
  const speed = 55 + Math.random() * 30
  bubbles.value.push({
    id: nextId++,
    kind,
    x: CX,
    y: CY,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
  })
}

function addRate(delta) {
  if (finished) return
  rate.value = Math.max(0, Math.min(100, rate.value + delta))
  if (rate.value >= 100) endGame()
}

function onLeft(b) {
  if (finished) return
  addRate(b.kind === '功' ? 2 : -2)
  removeBubble(b.id)
}
function onRight(b) {
  if (finished) return
  removeBubble(b.id) // 右键仅击碎，无效果
}
function removeBubble(id) {
  const i = bubbles.value.findIndex((x) => x.id === id)
  if (i >= 0) bubbles.value.splice(i, 1)
}

function frame(ts) {
  if (finished) return
  if (!lastTs) lastTs = ts
  const dt = Math.min(0.05, (ts - lastTs) / 1000)
  lastTs = ts
  const survivors = []
  for (const b of bubbles.value) {
    b.x += b.vx * dt
    b.y += b.vy * dt
    if (b.x < -R || b.x > W + R || b.y < -R || b.y > H + R) {
      // 逸出边缘：魔 -2%（让心魔逃逸是不利的）；功逸出无影响（错过+2%机会）
      if (b.kind === '魔') addRate(-2)
    } else {
      survivors.push(b)
    }
  }
  bubbles.value = survivors
  rafId = requestAnimationFrame(frame)
}

async function endGame() {
  if (finished) return
  finished = true
  cancelAnimationFrame(rafId); rafId = null
  clearInterval(spawnTimer); clearInterval(tickTimer)
  bubbles.value = []
  try {
    const res = await breakthroughTechnique(playerStore.playerId, technique.id, Math.round(rate.value))
    if (res.data?.player) playerStore.data = res.data.player
    store.result = res.data?.breakthrough || { success: false, narrative: '突破结算异常。' }
  } catch (e) {
    store.result = { success: false, narrative: '突破失败：' + (e.response?.data?.message || e.message) }
  }
}

function giveUp() {
  // 直接关闭：小游戏未走到结算(endGame)前不会消耗功法修为/触发突破
  finished = true
  cancelAnimationFrame(rafId); clearInterval(spawnTimer); clearInterval(tickTimer)
  store.close()
}

onMounted(() => {
  pool = makePool()
  spawnOne() // 立即出一个
  spawnTimer = setInterval(spawnOne, 1000)
  tickTimer = setInterval(() => {
    if (finished) return
    timeLeft.value -= 1
    if (timeLeft.value <= 0) { timeLeft.value = 0; endGame() }
  }, 1000)
  rafId = requestAnimationFrame(frame)
})

onUnmounted(() => {
  finished = true
  cancelAnimationFrame(rafId)
  clearInterval(spawnTimer)
  clearInterval(tickTimer)
})
</script>

<style scoped>
.tbg-overlay {
  position: fixed; inset: 0; z-index: 6000;
  display: flex; align-items: center; justify-content: center;
  background: rgba(4, 4, 10, 0.82); backdrop-filter: blur(3px);
}
.tbg-box {
  width: 660px; max-width: 96vw; padding: 18px 20px 20px;
  background: var(--bg-elev-1); border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg); box-shadow: var(--shadow-panel);
}
.tbg-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
.tbg-title { font-size: 1.02rem; color: #e0d8c0; font-weight: 600; letter-spacing: 0.05em; }
.tbg-x { font-size: 1.4rem; color: #8a8a9a; background: none; border: none; cursor: pointer; line-height: 1; }
.tbg-x:hover { color: #e0e0ec; }

.tbg-meta { display: flex; align-items: center; gap: 10px; margin-bottom: 6px; }
.tbg-rate { display: flex; align-items: baseline; gap: 6px; min-width: 96px; }
.tbg-rate-label { font-size: 0.78rem; color: #a0a0b0; }
.tbg-rate-val { font-size: 1.2rem; font-weight: 700; color: #7fd09a; }
.tbg-rate-val.full { color: #f0c040; }
.tbg-rate-bar { flex: 1; height: 10px; background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; }
.tbg-rate-fill { height: 100%; background: linear-gradient(90deg, #3a8f78, #6fbfa8); transition: width 0.15s; }
.tbg-time { font-size: 0.8rem; color: #c0a060; min-width: 64px; text-align: right; }
.tbg-hint { font-size: 0.72rem; color: #7a7a88; margin-bottom: 10px; }

.tbg-arena {
  position: relative; width: 600px; max-width: 100%; height: 360px; margin: 0 auto;
  background: radial-gradient(circle at center, rgba(60,50,90,0.35), rgba(10,10,18,0.6));
  border: 1px solid var(--border-strong); border-radius: var(--radius); overflow: hidden;
}
.tbg-center {
  position: absolute; left: 50%; top: 50%; width: 10px; height: 10px; margin: -5px 0 0 -5px;
  background: #c0a060; border-radius: 50%; box-shadow: 0 0 10px rgba(240,192,64,0.7);
}
.tbg-bubble {
  position: absolute; width: 52px; height: 52px; margin: -26px 0 0 -26px;
  display: flex; align-items: center; justify-content: center;
  font-size: 1.4rem; font-weight: 700; border-radius: 50%; cursor: pointer;
  user-select: none; transition: filter 0.1s;
}
.tbg-bubble.is-功 { color: #fff; background: radial-gradient(circle at 35% 30%, #8adfb0, #2f8f5a); box-shadow: 0 0 12px rgba(110,220,150,0.6); }
.tbg-bubble.is-魔 { color: #fff; background: radial-gradient(circle at 35% 30%, #c070d0, #5a1860); box-shadow: 0 0 12px rgba(180,80,200,0.6); }
.tbg-bubble:hover { filter: brightness(1.2); }

/* 结算 */
.tbg-result { text-align: center; padding: 30px 16px; }
.tbg-result-title { font-size: 1.4rem; font-weight: 700; letter-spacing: 0.1em; margin-bottom: 14px; }
.tbg-result.ok .tbg-result-title { color: #6fbfa8; }
.tbg-result.fail .tbg-result-title { color: #d4926a; }
.tbg-result-text { color: #d0c8b8; font-size: 0.92rem; line-height: 1.8; margin: 0 auto 22px; max-width: 520px; }
.tbg-result-btn { padding: 7px 28px; font-size: 0.86rem; color: #2a2010; background: #f0c040; border: 1px solid #d4a838; border-radius: var(--radius); cursor: pointer; font-weight: 600; }
.tbg-result-btn:hover { filter: brightness(1.1); }
</style>
