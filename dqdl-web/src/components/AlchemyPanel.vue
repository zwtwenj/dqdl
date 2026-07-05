<template>
  <div class="role-overlay" @click.self="emit('close')">
    <div class="role-panel alchemy-panel">
      <div class="role-header">
        <span class="role-title">炼丹</span>
        <div class="al-tab-switch">
          <button :class="['al-tab', { 'is-active': tab === 'craft' }]" @click="tab = 'craft'">炼丹</button>
          <button :class="['al-tab', { 'is-active': tab === 'shop' }]" @click="tab = 'shop'">丹房商铺</button>
        </div>
        <button class="role-close" @click="emit('close')">&times;</button>
      </div>

      <!-- 炼丹（三栏布局） -->
      <div v-if="tab === 'craft'" class="al-body">
        <!-- 左：丹方列表（仅显示已学习） -->
        <div class="al-col al-recipes">
          <div v-for="r in learnedRecipes" :key="r.recipe_id" :class="['al-recipe', { 'is-selected': selectedId === r.recipe_id }]" @click="selectRecipe(r)">
            <div class="al-recipe-name">{{ r.name }}</div>
            <div class="al-recipe-tier">{{ ['', '一阶', '二阶', '三阶', '四阶'][r.tier] || r.tier + '阶' }}</div>
            <div class="al-recipe-band">
              <span v-for="(v, e) in r.required" :key="e" class="al-band-item">{{ e }}{{ v }}±{{ r.tolerance[e] || 0 }}</span>
            </div>
          </div>
          <div v-if="learnedRecipes.length === 0" class="al-empty">尚未学习任何丹方，请前往丹房商铺学习</div>
        </div>

        <!-- 中：丹炉 + 元素能量 + 炼制（与是否选中丹方无关，常驻显示） -->
        <div class="al-col al-center">
          <div class="al-ws-title">
            {{ selected ? selected.name : '未选择丹方' }}
            <button v-if="selected && !selected.learned" class="al-mini-btn al-learn" :disabled="busy" @click="learn(selected)">学习 ({{ selected.price }}金)</button>
          </div>
          <div class="al-furnace-info" v-if="furnace">
            <span class="al-furnace-name">{{ furnace.name }}</span>
            <span class="al-furnace-meta">耐久 {{ furnace.durability }} · 容量 {{ furnace.cap }} · 槽位 {{ furnace.slots }}</span>
          </div>

          <!-- 丹炉舞台：火焰常驻，炼制时抖动+火焰变旺 -->
          <div class="al-furnace-stage" :class="{ crafting: crafting }">
            <div class="al-furnace-glow"></div>
            <div class="al-furnace-box" :class="{ shaking: crafting }">
              <div class="al-flame-wrap">
                <span class="al-flame al-flame--outer"></span>
                <span class="al-flame al-flame--mid"></span>
                <span class="al-flame al-flame--inner"></span>
              </div>
              <img src="/image/furnace.png" alt="丹炉" class="al-furnace" draggable="false" />
            </div>
          </div>

          <!-- 元素能量条：始终显示全部七元素，投入什么显什么；选中丹方时该方所需元素额外显示目标公差带 -->
          <div class="al-elems">
            <div v-for="e in displayElements" :key="e" class="al-elem" :class="elemClass(e)">
              <div class="al-elem-head">
                <span class="al-elem-name">{{ e }}</span>
                <span class="al-elem-val">{{ totals[e] || 0 }}<template v-if="targetOf(e) != null"> / {{ targetOf(e) }}±{{ tolOf(e) }}</template></span>
              </div>
              <div class="al-bar">
                <div v-if="targetOf(e) != null" class="al-band-zone" :style="bandStyle(e)"></div>
                <div class="al-fill" :style="fillStyle(e)"></div>
              </div>
            </div>
          </div>

          <button class="al-craft-btn" :disabled="busy || !selected" @click="craft">
            {{ busy ? (crafting ? '炼制中...' : '结算中...') : (selected ? '🔥 炼制' : '请先选择丹方') }}
          </button>
          <transition name="al-fade">
            <div v-if="result" :class="['al-result', { 'is-ok': result.success }]">
              <span class="al-result-icon">{{ result.success ? '✨' : '💨' }}</span>{{ result.reason }}
            </div>
          </transition>
        </div>

        <!-- 右：投放材料 + 背包材料（常驻显示） -->
        <div class="al-col al-materials">
          <!-- 投放材料 -->
          <div class="al-section-title">投放材料 <span class="al-slots">已用 {{ selectedIngredients.length }}/{{ furnace ? furnace.slots : 4 }} 槽</span></div>
          <div class="al-ing-list">
            <div v-for="ing in selectedIngredients" :key="ing.name" class="al-ing">
              <span class="al-ing-name">{{ ing.name }}</span>
              <span class="al-ing-elem">{{ elemText(ing.name) }}</span>
              <button class="al-cnt-btn" @click="decIng(ing)">−</button>
              <span class="al-cnt">{{ ing.count }}</span>
              <button class="al-cnt-btn" @click="incIng(ing)">+</button>
              <button class="al-cnt-btn al-del" @click="delIng(ing)">✕</button>
            </div>
            <div v-if="!selectedIngredients.length" class="al-empty-inline">从下方选择材料投放</div>
          </div>

          <!-- 材料库（背包中带元素能量的物品） -->
          <div class="al-section-title">材料（背包）</div>
          <div class="al-pool">
            <button v-for="m in ingredientPool" :key="m.name" class="al-pool-item" @click="addIng(m)">
              <span class="al-pool-name">{{ m.name }}</span>
              <span class="al-pool-elem">{{ elemText(m.name) }}</span>
              <span class="al-pool-count">×{{ m.count }}</span>
            </button>
            <div v-if="!ingredientPool.length" class="al-empty-inline">背包中没有可炼丹材料，去野外采集或丹房购买</div>
          </div>
        </div>
      </div>

      <!-- 丹房商铺 -->
      <div v-else class="al-body al-shop">
        <div class="al-col">
          <div class="al-section-title">草药</div>
          <div v-for="h in shop.herbs" :key="h.item_id" class="al-shop-row">
            <span class="al-shop-name">{{ h.name }}</span>
            <span class="al-shop-sub">{{ elemPretty(h.element_energy) }}</span>
            <button class="al-mini-btn" :disabled="busy" @click="buy('item', h.item_id)">购 {{ h.price }}金</button>
          </div>
          <div class="al-section-title" style="margin-top:14px">丹方</div>
          <div v-for="r in shop.recipes" :key="r.recipe_id" class="al-shop-row">
            <span class="al-shop-name">{{ r.name }}</span>
            <span class="al-shop-sub">{{ ['', '一阶', '二阶', '三阶'][r.tier] }}</span>
            <button class="al-mini-btn" :disabled="busy" @click="learnById(r)">学习 {{ r.price }}金</button>
          </div>
        </div>
        <div class="al-col">
          <div class="al-section-title">丹炉</div>
          <div v-for="f in shop.furnaces" :key="f.item_id" class="al-shop-row">
            <span class="al-shop-name">{{ f.name }}</span>
            <span class="al-shop-sub">{{ f.spec.slots }}槽·容量{{ f.spec.cap }}</span>
            <button class="al-mini-btn" :disabled="busy || f.price === 0" @click="buy('item', f.item_id)">购 {{ f.price }}金</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePlayerStore } from '../stores/player'
import { useBackpackStore } from '../stores/backpack'
import {
  getAlchemyRecipes, getAlchemyMaterials, getAlchemyFurnaces,
  getAlchemyShop, learnRecipe, alchemyBuy, alchemyAttempt,
} from '../api'
import { Message } from '../utils/message'

const emit = defineEmits(['close'])
const playerStore = usePlayerStore()
const backpackStore = useBackpackStore()

const tab = ref('craft')
const recipes = ref([])
const catalog = ref([])           // [{name, element_energy}]
const furnaceInfo = ref(null)     // {equipped, durability, furnaces:[...]}
const shop = ref({ herbs: [], recipes: [], furnaces: [] })
const selectedId = ref(null)
const selectedIngredients = ref([])  // [{name, count}]
const busy = ref(false)
const crafting = ref(false)   // 丹炉抖动+火焰变旺的炼制动画窗口
const result = ref(null)

const ELEMENTS = ['金', '木', '水', '火', '土', '雷', '风']

const selected = computed(() => recipes.value.find(r => r.recipe_id === selectedId.value) || null)
const learnedRecipes = computed(() => recipes.value.filter(r => r.learned))
// 始终显示全部七元素（投入什么显什么，未投入的显示 0），与是否选中丹方无关
const displayElements = computed(() => ELEMENTS.slice())
// 元素的目标值（仅当选中丹方且该方需要此元素时存在），否则仅显示当前投入量
function targetOf(e) { return selected.value?.required?.[e] }
function tolOf(e) { return selected.value?.tolerance?.[e] || 0 }
const furnace = computed(() => {
  if (!furnaceInfo.value?.equipped) return null
  const f = furnaceInfo.value.furnaces.find(x => x.item_id === furnaceInfo.value.equipped)
  if (!f) return null
  return { name: f.name, durability: furnaceInfo.value.durability, cap: f.spec.cap, slots: f.spec.slots, tier: f.spec.tier }
})

const materialMap = computed(() => {
  const m = new Map()
  for (const c of catalog.value) m.set(c.name, c.element_energy || {})
  return m
})

const ingredientPool = computed(() => {
  const items = backpackStore.items || []
  return items.filter(i => materialMap.value.has(i.name) && i.count > 0)
})

const totals = computed(() => {
  const t = {}
  for (const ing of selectedIngredients.value) {
    const el = materialMap.value.get(ing.name) || {}
    for (const e of Object.keys(el)) t[e] = (t[e] || 0) + (el[e] || 0) * ing.count
  }
  return t
})

function elemText(name) {
  const el = materialMap.value.get(name) || {}
  return Object.keys(el).map(e => `${e}${el[e]}`).join(' ')
}
function elemPretty(el) {
  return Object.keys(el).map(e => `${e}${el[e]}`).join(' ')
}

function selectRecipe(r) {
  selectedId.value = r.recipe_id
  selectedIngredients.value = []
  result.value = null
}

function addIng(m) {
  const existing = selectedIngredients.value.find(i => i.name === m.name)
  if (existing) {
    if (existing.count < m.count) existing.count++
  } else {
    if (!furnace.value || selectedIngredients.value.length < furnace.value.slots) {
      selectedIngredients.value.push({ name: m.name, count: 1 })
    } else {
      Message.warning('丹炉槽位已满')
    }
  }
}
function incIng(ing) {
  const owned = (backpackStore.items.find(i => i.name === ing.name)?.count) || 0
  if (ing.count < owned) ing.count++
}
function decIng(ing) { if (ing.count > 1) ing.count--; else delIng(ing) }
function delIng(ing) { selectedIngredients.value = selectedIngredients.value.filter(i => i.name !== ing.name) }

function inBand(e) {
  const need = targetOf(e)
  if (need == null) return false           // 该元素非丹方所需，不存在"命中"状态
  const got = totals.value[e] || 0
  return got >= need - tolOf(e) && got <= need + tolOf(e)
}
function overCap(e) {
  if (!furnace.value) return false
  return (totals.value[e] || 0) > furnace.value.cap
}
function elemClass(e) {
  return { 'is-ok': inBand(e), 'is-over': overCap(e) }
}
function bandStyle(e) {
  const need = targetOf(e)
  if (need == null || !furnace.value) return {}   // 无目标元素不画公差带
  const tol = tolOf(e)
  const cap = furnace.value.cap
  const left = Math.max(0, (need - tol) / cap) * 100
  const width = Math.min(100, ((need + tol) / cap) * 100) - left
  return { left: left + '%', width: width + '%' }
}
function fillStyle(e) {
  if (!furnace.value) return {}
  const cap = furnace.value.cap
  const w = Math.min(100, ((totals.value[e] || 0) / cap) * 100)
  return { width: w + '%' }
}

async function loadAll() {
  const pid = playerStore.playerId
  if (!pid) return
  const [r, m, f, s] = await Promise.all([
    getAlchemyRecipes(pid), getAlchemyMaterials(), getAlchemyFurnaces(pid), getAlchemyShop(),
  ])
  recipes.value = r.data
  catalog.value = m.data
  furnaceInfo.value = f.data
  shop.value = s.data
  await backpackStore.fetch()
}

async function craft() {
  const pid = playerStore.playerId
  if (!pid || !selected.value || busy.value) return
  if (!selected.value.learned) { Message.warning('尚未学习该丹方'); return }
  busy.value = true
  crafting.value = true       // 丹炉开始抖动、火焰变旺
  result.value = null
  const delay5s = new Promise((r) => setTimeout(r, 5000))
  try {
    // API 与 5s 动画并行：确保丹炉至少炼制 5 秒再出结果
    const [res] = await Promise.all([
      alchemyAttempt(pid, selected.value.recipe_id,
        selectedIngredients.value.map(i => ({ name: i.name, count: i.count }))),
      delay5s,
    ])
    result.value = res.data
    if (res.data.success) Message.success(res.data.reason)
    else Message.warning(res.data.reason)
    selectedIngredients.value = []
    await backpackStore.fetch()
    // 刷新丹炉耐久
    const f = await getAlchemyFurnaces(pid)
    furnaceInfo.value = f.data
  } catch (err) {
    await delay5s
    Message.error('炼制失败: ' + (err.response?.data?.message || err.message))
  } finally {
    crafting.value = false
    busy.value = false
  }
}

async function learn(r) {
  const pid = playerStore.playerId
  busy.value = true
  try {
    await learnRecipe(pid, r.recipe_id)
    Message.success('已学习 ' + r.name)
    await loadAll()
  } catch (err) {
    Message.error(err.response?.data?.message || err.message)
  } finally { busy.value = false }
}
async function learnById(r) {
  const pid = playerStore.playerId
  busy.value = true
  try {
    const res = await learnRecipe(pid, r.recipe_id)
    Message.success(res.data.message || '已学习')
    await loadAll()
  } catch (err) {
    Message.error(err.response?.data?.message || err.message)
  } finally { busy.value = false }
}
async function buy(kind, id) {
  const pid = playerStore.playerId
  busy.value = true
  try {
    const res = await alchemyBuy(pid, kind, id)
    Message.success(res.data.message || '已购入')
    await backpackStore.fetch()
    await playerStore.refresh?.()
  } catch (err) {
    Message.error(err.response?.data?.message || err.message)
  } finally { busy.value = false }
}

onMounted(loadAll)
</script>

<style scoped>
.alchemy-panel { width: 1200px; max-width: 95vw; height: 760px; max-height: 92vh; display: flex; flex-direction: column; }
.al-tab-switch { display: flex; gap: 6px; }
.al-tab { background: transparent; border: 1px solid var(--border, #555); color: var(--text-dim, #aaa); padding: 3px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; }
.al-tab.is-active { background: var(--primary, #7c5cff); color: #fff; border-color: transparent; }
/* 三栏主体：固定高度，左中右各自独立滚动，互不影响 */
.al-body { display: flex; gap: 14px; flex: 1 1 auto; min-height: 0; overflow: hidden; }
.al-col { min-width: 0; height: 100%; overflow-y: auto; padding-right: 4px; }
/* 左=丹方列表(固定宽)，中=丹炉(略宽)，右=材料 */
.al-recipes { flex: 0 0 240px; max-width: 240px; padding: 10px 0; }
.al-center { flex: 1.2 1 0; display: flex; flex-direction: column; overflow: hidden; padding-right: 0; gap: 6px; padding: 10px 0; }
.al-materials { flex: 1 1 0; padding: 10px 0; }
.al-furnace-info { background: rgba(124,92,255,.12); border: 1px solid var(--primary,#7c5cff); border-radius: 8px; padding: 6px 10px; margin-bottom: 2px; font-size: 12px; flex-shrink: 0; }
.al-furnace-name { font-weight: 600; color: var(--primary,#c0a0f0); margin-right: 6px; }
.al-furnace-meta { color: var(--text-dim,#999); }
.al-recipe { border: 1px solid var(--border,#444); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; cursor: pointer; transition: .15s; }
.al-recipe:hover { border-color: var(--primary,#7c5cff); }
.al-recipe.is-selected { border-color: var(--primary,#7c5cff); background: rgba(124,92,255,.1); }
.al-recipe.is-locked { opacity: .6; }
.al-recipe-name { font-weight: 600; }
.al-recipe-tier { font-size: 12px; color: var(--text-dim,#999); }
.al-recipe-band { margin-top: 4px; font-size: 12px; }
.al-band-item { margin-right: 8px; color: var(--accent,#e0c060); }
.al-locked-mark { font-size: 11px; color: #e08060; margin-top: 2px; }

.al-ws-title { font-size: 18px; font-weight: 700; display: flex; align-items: center; gap: 10px; margin-bottom: 2px; flex-shrink: 0; }
.al-section-title { font-size: 13px; color: var(--text-dim,#bbb); margin: 10px 0 6px; border-bottom: 1px solid var(--border,#333); padding-bottom: 3px; display: flex; justify-content: space-between; }
.al-slots { font-size: 12px; }

/* 丹炉舞台：中间栏的弹性区，吸收高度变化，丹炉图垂直居中并按可用高度等比缩放 */
.al-furnace-stage {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  flex: 1 1 auto;
  min-height: 160px;
  overflow: hidden;
}
.al-elems { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; flex-shrink: 0; }
.al-elem { border: 1px solid var(--border,#444); border-radius: 6px; padding: 6px 8px; }
.al-elem.is-ok { border-color: #5fae5f; background: rgba(95,174,95,.1); }
.al-elem.is-over { border-color: #e06060; background: rgba(224,96,96,.12); }
.al-elem-head { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 4px; }
.al-elem-name { font-weight: 600; }
.al-bar { position: relative; height: 10px; background: rgba(0,0,0,.3); border-radius: 5px; overflow: hidden; }
.al-band-zone { position: absolute; top: 0; bottom: 0; background: rgba(224,192,96,.3); }
.al-fill { position: absolute; top: 0; bottom: 0; left: 0; background: var(--primary,#7c5cff); transition: width .2s; }
.al-elem.is-ok .al-fill { background: #5fae5f; }
.al-elem.is-over .al-fill { background: #e06060; }

.al-ing-list { display: flex; flex-direction: column; gap: 4px; }
.al-ing { display: flex; align-items: center; gap: 6px; padding: 4px 6px; border: 1px solid var(--border,#444); border-radius: 6px; font-size: 13px; }
.al-ing-name { font-weight: 600; min-width: 70px; }
.al-ing-elem { color: var(--text-dim,#999); flex: 1; font-size: 12px; }
.al-cnt-btn { width: 24px; height: 24px; border-radius: 5px; border: 1px solid var(--border,#555); background: transparent; color: var(--text,#eee); cursor: pointer; }
.al-cnt-btn:hover { background: rgba(255,255,255,.1); }
.al-cnt { min-width: 20px; text-align: center; }
.al-del { color: #e08060; width: auto; padding: 0 6px; }

.al-pool { display: flex; flex-wrap: wrap; gap: 6px; }
.al-pool-item { display: flex; flex-direction: column; align-items: flex-start; border: 1px solid var(--border,#444); border-radius: 6px; padding: 5px 8px; background: transparent; color: var(--text,#eee); cursor: pointer; }
.al-pool-item:hover { border-color: var(--primary,#7c5cff); }
.al-pool-name { font-size: 13px; font-weight: 600; }
.al-pool-elem { font-size: 11px; color: var(--text-dim,#999); }
.al-pool-count { font-size: 11px; color: var(--accent,#e0c060); }

.al-craft-btn { width: 100%; padding: 10px; margin-top: 10px; border-radius: 8px; border: none; background: var(--primary,#7c5cff); color: #fff; font-size: 15px; font-weight: 600; cursor: pointer; flex-shrink: 0; }
.al-craft-btn:disabled { opacity: .5; cursor: not-allowed; }
.al-result { margin-top: 6px; padding: 8px; border-radius: 6px; background: rgba(224,128,96,.15); border: 1px solid #e08060; font-size: 13px; display:flex; align-items:center; gap:6px; flex-shrink: 0; }
.al-result.is-ok { background: rgba(95,174,95,.15); border-color: #5fae5f; }
.al-result-icon { font-size: 16px; }
.al-fade-enter-active { transition: all .35s ease; }
.al-fade-enter-from { opacity: 0; transform: translateY(8px); }

/* ===== 丹炉舞台 + 火焰 + 抖动 ===== */
/* 丹炉盒子：火焰与图片的定位锚点，抖动施加在盒子上使整体一起颤动 */
.al-furnace-box {
  position: relative;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  height: 100%;
  transform-origin: bottom center;
}
.al-furnace {
  display: block;
  height: 100%;
  width: 300px;
  max-width: 100%;
  object-fit: cover;
  filter: drop-shadow(0 6px 10px rgba(0,0,0,.5));
  user-select: none;
}
.al-furnace-box.shaking { animation: al-shake .28s infinite; }
@keyframes al-shake {
  0%   { transform: translate(0,0) rotate(0); }
    20%  { transform: translate(-2px,1px) rotate(-1.2deg); }
    40%  { transform: translate(2px,-1px) rotate(1.2deg); }
    60%  { transform: translate(-1px,2px) rotate(-0.8deg); }
    80%  { transform: translate(1px,-2px) rotate(0.8deg); }
    100% { transform: translate(0,0) rotate(0); }
}

/* 火焰：三层叠加，从丹炉口冒出。改 top 值即可对齐炉口位置 */
.al-flame-wrap {
  position: absolute;
  left: 50%;
  bottom: 0px;             /* 负值=炉口上方；按实际图片微调 */
  transform: translateX(-50%);
  width: 200px;
  height: 340px;
  z-index: 3;
  pointer-events: none;
}
.al-flame {
  position: absolute;
  left: 50%;
  bottom: 0;
  transform: translateX(-50%);
  border-radius: 50% 50% 20% 20% / 70% 70% 30% 30%;
  filter: blur(2.5px);
  transform-origin: bottom center;
  animation: al-flicker .55s infinite alternate ease-in-out;
}
.al-flame--outer {
  width: 300px; height: 250px;
  background: radial-gradient(ellipse at 50% 80%, rgba(255,120,40,.95), rgba(220,50,30,.6) 55%, rgba(180,30,20,0) 75%);
}
.al-flame--mid {
  width: 150px; height: 160px;
  background: radial-gradient(ellipse at 50% 80%, rgba(255,210,80,.95), rgba(255,140,30,.55) 60%, rgba(255,100,20,0) 80%);
  animation-duration: .42s;
}
.al-flame--inner {
  width: 80px; height: 100px;
  background: radial-gradient(ellipse at 50% 80%, rgba(255,255,220,.95), rgba(255,220,120,0) 75%);
  filter: blur(1.5px);
  animation-duration: .32s;
}
@keyframes al-flicker {
  0%   { transform: translateX(-50%) scaleY(.85) scaleX(1.04) skewX(-2deg); opacity: .82; }
    50%  { transform: translateX(-50%) scaleY(1.05) scaleX(.95) skewX(3deg); opacity: 1; }
    100% { transform: translateX(-50%) scaleY(.92) scaleX(1.02) skewX(-1deg); opacity: .9; }
}
/* 炼制中：火焰整体变大变亮 */
.al-furnace-stage.crafting .al-flame-wrap { transform: translateX(-50%) scale(1.35); filter: brightness(1.25); transition: transform .3s; }
.al-furnace-stage.crafting .al-flame { animation-duration: .28s; }
/* 底部炉火辉光 */
.al-furnace-glow {
  position: absolute;
  bottom: 6px;
  left: 50%;
  transform: translateX(-50%);
  width: 140px;
  height: 36px;
  background: radial-gradient(ellipse at 50% 50%, rgba(255,140,40,.5), rgba(255,80,20,0) 70%);
  filter: blur(6px);
  z-index: 1;
  animation: al-glow 1.1s infinite alternate ease-in-out;
}
@keyframes al-glow { from { opacity: .5; transform: translateX(-50%) scale(.9); } to { opacity: .9; transform: translateX(-50%) scale(1.08); } }

.al-empty { color: var(--text-dim,#999); text-align: center; padding: 40px 0; }
.al-empty-inline { color: var(--text-dim,#999); font-size: 12px; padding: 6px; }

.al-shop-row { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border,#333); }
.al-shop-name { font-weight: 600; min-width: 90px; }
.al-shop-sub { flex: 1; color: var(--text-dim,#999); font-size: 12px; }
.al-mini-btn { border: 1px solid var(--primary,#7c5cff); background: rgba(124,92,255,.12); color: var(--primary,#c0a0f0); border-radius: 5px; padding: 3px 8px; cursor: pointer; font-size: 12px; }
.al-mini-btn:disabled { opacity: .5; cursor: not-allowed; }
.al-learn { margin-left: auto; }
</style>
