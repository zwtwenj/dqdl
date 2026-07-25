<script setup>
/**
 * 炼丹面板（左中右三栏 + 丹炉动画）。
 * 左栏：已学习丹方列表
 * 中栏：丹炉舞台 + 七元素能量条 + 炼制按钮 + 结果
 * 右栏：投放材料清单 + 背包材料池
 *
 * 数据：recipes/materials/furnaces 从后端拉，materials 按 item_id 操作。
 */
import { ref, computed, watch, onMounted } from 'vue'
import { usePanelStack } from '../composables/usePanelStack'
import { usePanelDraggable } from '../composables/usePanelDraggable'
import { useBackpackStore } from '../stores/backpack'
import { bus, BusEvents } from '../utils/eventBus'
import {
  getAlchemyRecipes, getAlchemyMaterials, getAlchemyFurnaces,
  equipFurnace as apiEquip, getAlchemyShop, alchemyBuy, learnRecipe, alchemyAttempt,
} from '../api/alchemy'

const props = defineProps({
  modelValue: Boolean,
  player: { type: Object, default: null },
  pos: { type: Object, default: null },
})
const emit = defineEmits(['update:modelValue', 'update:pos'])

const { z, focus, mount, unmount } = usePanelStack('alchemy')
watch(() => props.modelValue, (v) => { if (v) { mount(); focus(); loadAll() } else unmount() })
onMounted(() => { if (props.modelValue) { mount(); loadAll() } })

const panelRef = ref(null)
const posModel = computed({ get: () => props.pos, set: (v) => emit('update:pos', v) })
const { dragging, onHandlePointerDown } = usePanelDraggable({ elRef: panelRef, pos: posModel, onStart: focus })

const backpackStore = useBackpackStore()
const playerStorePlayer = computed(() => props.player)

/* ---- 数据 ---- */
const recipes = ref([])
const materials = ref([])    // 材料目录 [{item_id,name,element_energy,...}]
const furnaceInfo = ref({ equipped: null, durability: 0, furnaces: [] })
const shopData = ref({ herbs: [], recipes: [], furnaces: [] })
const crafting = ref(false)
const craftResult = ref(null)
const activeTab = ref('craft')

const selectedRecipe = ref(null)
const ingredients = ref([]) // [{item_id,name,count}]

const ELEMENTS = ['金', '木', '水', '火', '土', '雷', '风']

/* ---- computed ---- */
const learnedRecipes = computed(() => recipes.value.filter((r) => r.learned))

const materialMap = computed(() => new Map(materials.value.map((m) => [m.item_id, m])))

const ingredientPool = computed(() => {
  const slots = backpackStore.slots || []
  return slots.filter((s) => materialMap.value.has(s.item_id) && s.count > 0)
})

const totals = computed(() => {
  const t = {}
  for (const ing of ingredients.value) {
    const m = materialMap.value.get(ing.item_id)
    if (!m) continue
    for (const e of Object.keys(m.element_energy)) {
      t[e] = (t[e] || 0) + (m.element_energy[e] || 0) * ing.count
    }
  }
  return t
})

const usedSlots = computed(() => ingredients.value.length)
const furnaceSlots = computed(() => {
  const eq = furnaceInfo.value.equipped
  const f = furnaceInfo.value.furnaces.find((x) => x.item_id === eq)
  return f?.spec?.slots || 4
})

/* ---- 方法 ---- */
async function loadAll() {
  try {
    const [r, m, f, s] = await Promise.all([
      getAlchemyRecipes(), getAlchemyMaterials(), getAlchemyFurnaces(), getAlchemyShop(),
    ])
    recipes.value = r || []
    materials.value = m || []
    furnaceInfo.value = f || { equipped: null, durability: 0, furnaces: [] }
    shopData.value = s || { herbs: [], recipes: [], furnaces: [] }
    if (props.player?.id) await backpackStore.load(props.player.id)
  } catch (e) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: '炼丹数据加载失败' })
  }
}

function selectRecipe(r) {
  selectedRecipe.value = r
  ingredients.value = []
  craftResult.value = null
}

function addIng(item) {
  const existing = ingredients.value.find((i) => i.item_id === item.item_id)
  if (existing) {
    const owned = backpackStore.slots.find((s) => s.item_id === item.item_id)?.count || 0
    if (existing.count >= owned) return
    existing.count++
  } else {
    if (ingredients.value.length >= furnaceSlots.value) {
      bus.emit(BusEvents.TOAST, { type: 'error', message: `丹炉最多投放 ${furnaceSlots.value} 种材料` })
      return
    }
    ingredients.value.push({ item_id: item.item_id, name: item.item?.name || item.item_id, count: 1 })
  }
}

function incIng(ing) {
  const owned = backpackStore.slots.find((s) => s.item_id === ing.item_id)?.count || 0
  if (ing.count < owned) ing.count++
}
function decIng(ing) { if (ing.count > 1) ing.count--; else delIng(ing) }
function delIng(ing) { ingredients.value = ingredients.value.filter((i) => i.item_id !== ing.item_id) }

async function craft() {
  if (!selectedRecipe.value || ingredients.value.length === 0 || crafting.value) return
  crafting.value = true
  craftResult.value = null
  try {
    const [res] = await Promise.all([
      alchemyAttempt(selectedRecipe.value.recipe_id, ingredients.value.map((i) => ({ item_id: i.item_id, count: i.count }))),
      new Promise((r) => setTimeout(r, 5000)),
    ])
    craftResult.value = res
    ingredients.value = []
    bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
    if (props.player?.id) await backpackStore.load(props.player.id)
    const f = await getAlchemyFurnaces()
    furnaceInfo.value = f
    // 刷新丹方 learned 状态
    const r = await getAlchemyRecipes()
    recipes.value = r
  } catch (e) {
    bus.emit(BusEvents.TOAST, { type: 'error', message: e.message || '炼制失败' })
  } finally {
    crafting.value = false
  }
}

async function doEquip(itemId) {
  try {
    await apiEquip(itemId)
    const f = await getAlchemyFurnaces()
    furnaceInfo.value = f
    bus.emit(BusEvents.TOAST, { type: 'success', message: '已更换丹炉' })
  } catch (e) { bus.emit(BusEvents.TOAST, { type: 'error', message: e.message }) }
}

async function doBuy(kind, id) {
  try {
    await alchemyBuy(kind, id)
    bus.emit(BusEvents.TOAST, { type: 'success', message: '购买成功' })
    bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
    if (props.player?.id) await backpackStore.load(props.player.id)
    const r = await getAlchemyRecipes()
    recipes.value = r
  } catch (e) { bus.emit(BusEvents.TOAST, { type: 'error', message: e.message }) }
}

async function doLearn(recipeId) {
  try {
    await learnRecipe(recipeId)
    bus.emit(BusEvents.TOAST, { type: 'success', message: '学习成功' })
    bus.emit(BusEvents.PLAYER_STATUS_CHANGE)
    const r = await getAlchemyRecipes()
    recipes.value = r
  } catch (e) { bus.emit(BusEvents.TOAST, { type: 'error', message: e.message }) }
}

function close() { emit('update:modelValue', false) }
</script>

<template>
  <div
    v-if="modelValue"
    ref="panelRef"
    class="alchemy-panel"
    :style="pos ? { left: pos.x + 'px', top: pos.y + 'px', right: 'auto', bottom: 'auto', transform: 'none', zIndex: z } : { zIndex: z }"
    @pointerdown="focus"
  >
    <div class="drag-handle" @pointerdown.stop="onHandlePointerDown">
      <span class="panel-title">⚗️ 炼丹</span>
      <div class="tab-switch">
        <button :class="{ active: activeTab === 'craft' }" @click="activeTab = 'craft'">炼丹</button>
        <button :class="{ active: activeTab === 'shop' }" @click="activeTab = 'shop'">商铺</button>
      </div>
      <button class="close-btn" @click="close">×</button>
    </div>

    <!-- ===== 炼丹 Tab ===== -->
    <div v-if="activeTab === 'craft'" class="al-body">
      <!-- 左栏：丹方 -->
      <div class="al-recipes">
        <div class="col-label">丹方（已学习）</div>
        <div
          v-for="r in learnedRecipes"
          :key="r.recipe_id"
          :class="['recipe-card', { selected: selectedRecipe?.recipe_id === r.recipe_id }]"
          @click="selectRecipe(r)"
        >
          <div class="recipe-name">{{ r.name }}</div>
          <div class="recipe-elem">
            <span v-for="(v, k) in r.required" :key="k" class="elem-tag">{{ k }}{{ v }}±{{ r.tolerance[k] || 0 }}</span>
          </div>
          <div class="recipe-tier">{{ ['', '一阶', '二阶', '三阶'][r.tier] || '?' }}丹</div>
        </div>
        <div v-if="!learnedRecipes.length" class="empty-hint">尚未学习任何丹方</div>
      </div>

      <!-- 中栏：丹炉+元素+炼制 -->
      <div class="al-center">
        <div class="furnace-info" v-if="furnaceInfo.equipped">
          {{ furnaceInfo.furnaces.find(f => f.item_id === furnaceInfo.equipped)?.name || '丹炉' }}
          · 耐久 {{ furnaceInfo.durability }}
          · 容量 {{ furnaceInfo.furnaces.find(f => f.item_id === furnaceInfo.equipped)?.spec?.cap || '?' }}
        </div>
        <div class="furnace-info" v-else>未装备丹炉</div>

        <!-- 丹炉舞台 -->
        <div :class="['furnace-stage', { crafting }]">
          <div class="furnace-glow"></div>
          <div :class="['furnace-box', { shaking: crafting }]">
            <div class="flame-wrap" v-if="crafting">
              <div class="flame outer"></div>
              <div class="flame mid"></div>
              <div class="flame inner"></div>
            </div>
            <img src="/furnace.png" class="furnace-img" alt="丹炉">
          </div>
        </div>

        <!-- 元素能量条 -->
        <div class="elem-bars">
          <div v-for="e in ELEMENTS" :key="e" class="elem-bar-row">
            <span class="elem-label">{{ e }}</span>
            <div class="elem-bar-track">
              <div
                class="elem-bar-fill"
                :style="{ width: Math.min(100, (totals[e] || 0)) + '%' }"
                :class="{
                  matched: selectedRecipe && (totals[e] || 0) >= (selectedRecipe.required[e] - selectedRecipe.tolerance[e]) && (totals[e] || 0) <= (selectedRecipe.required[e] + selectedRecipe.tolerance[e]),
                  impure: selectedRecipe && !(e in (selectedRecipe.required || {})) && (totals[e] || 0) > 0
                }"
              ></div>
            </div>
            <span class="elem-val">{{ totals[e] || 0 }}</span>
            <span v-if="selectedRecipe && selectedRecipe.required[e]" class="elem-target">需{{ selectedRecipe.required[e] }}±{{ selectedRecipe.tolerance[e] }}</span>
          </div>
        </div>

        <button class="craft-btn" :disabled="!selectedRecipe || !ingredients.length || crafting" @click="craft()">
          {{ crafting ? '🔥 炼制中...' : '🔥 炼制' }}
        </button>

        <div v-if="craftResult" :class="['craft-result', craftResult.success ? 'success' : 'fail']">
          {{ craftResult.success ? '✨' : '💨' }} {{ craftResult.reason }}
        </div>
      </div>

      <!-- 右栏：材料 -->
      <div class="al-materials">
        <div class="col-label">投放材料 ({{ usedSlots }}/{{ furnaceSlots }} 槽)</div>
        <div class="ing-list">
          <div v-for="ing in ingredients" :key="ing.item_id" class="ing-item">
            <span class="ing-name">{{ ing.name }}</span>
            <button class="ing-btn" @click="decIng(ing)">−</button>
            <span class="ing-count">{{ ing.count }}</span>
            <button class="ing-btn" @click="incIng(ing)">+</button>
            <button class="ing-del" @click="delIng(ing)">✕</button>
          </div>
        </div>
        <div class="col-label" style="margin-top:8px">背包材料</div>
        <div class="material-pool">
          <div
            v-for="s in ingredientPool"
            :key="s.item_id"
            class="pool-item"
            @click="addIng(s)"
          >
            <span>{{ s.item?.name || s.item_id }}</span>
            <span class="pool-count">×{{ s.count }}</span>
          </div>
          <div v-if="!ingredientPool.length" class="empty-hint">背包无可用材料</div>
        </div>
      </div>
    </div>

    <!-- ===== 商铺 Tab ===== -->
    <div v-if="activeTab === 'shop'" class="shop-body">
      <div class="shop-section">
        <div class="col-label">草药</div>
        <div class="shop-grid">
          <div v-for="h in shopData.herbs" :key="h.item_id" class="shop-item" @click="doBuy('item', h.item_id)">
            <span>{{ h.name }}</span>
            <span class="shop-price">{{ h.price }}金</span>
          </div>
        </div>
      </div>
      <div class="shop-section">
        <div class="col-label">丹方</div>
        <div class="shop-grid">
          <div v-for="r in shopData.recipes" :key="r.recipe_id" class="shop-item" @click="doLearn(r.recipe_id)">
            <span>{{ r.name }}</span>
            <span class="shop-price">{{ r.price }}金</span>
          </div>
        </div>
      </div>
      <div class="shop-section">
        <div class="col-label">丹炉</div>
        <div class="shop-grid">
          <div v-for="f in shopData.furnaces" :key="f.item_id" class="shop-item" @click="doBuy('item', f.item_id)">
            <span>{{ f.name }}</span>
            <span class="shop-price">{{ f.price }}金</span>
          </div>
        </div>
      </div>
      <!-- 已拥有丹炉装备列表 -->
      <div v-if="furnaceInfo.furnaces.length" class="shop-section">
        <div class="col-label">已拥有丹炉（点击装备）</div>
        <div class="shop-grid">
          <div
            v-for="f in furnaceInfo.furnaces"
            :key="f.item_id"
            :class="['shop-item', { equipped: f.item_id === furnaceInfo.equipped }]"
            @click="doEquip(f.item_id)"
          >
            <span>{{ f.name }}</span>
            <span v-if="f.item_id === furnaceInfo.equipped" class="equipped-tag">已装备</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.alchemy-panel {
  position: absolute;
  left: 50%; top: 50%;
  transform: translate(-50%, -50%);
  width: 900px; height: 600px;
  background: linear-gradient(160deg, rgba(28,22,16,0.97), rgba(14,11,8,0.98));
  border: 1px solid rgba(180,150,90,0.45);
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.7);
  color: #e8e2d0;
  font-family: 'STKaiti','KaiTi','楷体',serif;
  overflow: hidden;
  display: flex; flex-direction: column;
}
.drag-handle {
  display: flex; align-items: center; justify-content: space-between;
  padding: 8px 16px; cursor: move;
  border-bottom: 1px solid rgba(150,120,70,0.25);
  background: rgba(40,30,18,0.5);
}
.panel-title { font-size: 16px; color: #e8d5a0; letter-spacing: 2px; }
.tab-switch { display: flex; gap: 4px; }
.tab-switch button {
  padding: 4px 12px; border: 1px solid rgba(150,120,70,0.3);
  background: transparent; color: rgba(200,180,150,0.5);
  border-radius: 4px; font-size: 13px; cursor: pointer; font-family: inherit;
}
.tab-switch button.active { background: rgba(150,120,70,0.2); color: #e8d5a0; border-color: rgba(200,170,110,0.5); }
.close-btn {
  width: 26px; height: 26px; border: 1px solid rgba(150,120,70,0.4);
  background: transparent; color: rgba(220,200,160,0.7);
  border-radius: 6px; font-size: 16px; cursor: pointer;
}
.close-btn:hover { background: rgba(150,120,70,0.2); color: #e8d5a0; }

/* ===== 炼丹 Tab ===== */
.al-body { flex: 1; display: flex; gap: 12px; padding: 12px; overflow: hidden; }
.al-recipes { flex: 0 0 200px; overflow-y: auto; }
.al-center { flex: 1.2 1 0; display: flex; flex-direction: column; align-items: center; gap: 8px; overflow-y: auto; padding: 8px; }
.al-materials { flex: 1 1 0; overflow-y: auto; }
.col-label { font-size: 12px; color: rgba(200,170,110,0.5); margin-bottom: 6px; letter-spacing: 1px; }
.empty-hint { font-size: 12px; color: rgba(120,100,70,0.35); text-align: center; padding: 12px; }

.recipe-card {
  padding: 8px 10px; border: 1px solid rgba(150,120,70,0.2); border-radius: 6px;
  margin-bottom: 6px; cursor: pointer; transition: all 0.18s;
}
.recipe-card:hover { border-color: rgba(200,170,110,0.5); background: rgba(40,32,20,0.5); }
.recipe-card.selected { border-color: rgba(220,190,120,0.7); background: rgba(60,48,28,0.6); }
.recipe-name { font-size: 14px; color: #e8d5a0; }
.recipe-elem { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
.elem-tag { font-size: 11px; color: rgba(180,160,130,0.6); background: rgba(40,30,18,0.4); padding: 1px 5px; border-radius: 3px; }
.recipe-tier { font-size: 11px; color: rgba(160,140,110,0.4); margin-top: 2px; }

.furnace-info { font-size: 12px; color: rgba(180,160,130,0.5); }
.furnace-stage { position: relative; width: 100%; height: 180px; display: flex; align-items: flex-end; justify-content: center; overflow: hidden; }
.furnace-glow { position: absolute; bottom: 10px; width: 200px; height: 30px; border-radius: 50%; background: radial-gradient(ellipse, rgba(255,120,30,0.2), transparent); }
.furnace-stage.crafting .furnace-glow { background: radial-gradient(ellipse, rgba(255,150,50,0.5), transparent); }
.furnace-box { position: relative; width: 160px; height: 170px; }
.furnace-box.shaking { animation: al-shake 0.28s infinite; }
@keyframes al-shake { 0%,100%{transform:translate(0,0) rotate(0)} 25%{transform:translate(-2px,0) rotate(-1deg)} 75%{transform:translate(2px,0) rotate(1deg)} }
.furnace-img { width: 100%; height: 100%; object-fit: contain; filter: drop-shadow(0 4px 12px rgba(0,0,0,0.6)); }
.flame-wrap { position: absolute; top: 20px; left: 50%; transform: translateX(-50%); width: 60px; height: 80px; }
.flame { position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); border-radius: 50% 50% 20% 20%; animation: flicker 0.4s infinite alternate; }
.flame.outer { width: 60px; height: 80px; background: radial-gradient(ellipse at bottom, rgba(255,100,0,0.6), transparent); }
.flame.mid { width: 40px; height: 60px; background: radial-gradient(ellipse at bottom, rgba(255,180,0,0.7), transparent); }
.flame.inner { width: 24px; height: 40px; background: radial-gradient(ellipse at bottom, rgba(255,240,200,0.8), transparent); }
@keyframes flicker { from { transform: translateX(-50%) scaleY(1); } to { transform: translateX(-50%) scaleY(1.15); } }
.furnace-stage.crafting .flame-wrap { transform: translateX(-50%) scale(1.3); }

/* 元素能量条 */
.elem-bars { width: 100%; display: flex; flex-direction: column; gap: 3px; }
.elem-bar-row { display: flex; align-items: center; gap: 4px; font-size: 12px; }
.elem-label { width: 16px; text-align: center; color: rgba(200,170,110,0.6); }
.elem-bar-track { flex: 1; height: 8px; background: rgba(30,24,16,0.6); border-radius: 4px; overflow: hidden; }
.elem-bar-fill { height: 100%; background: rgba(150,120,70,0.4); border-radius: 4px; transition: width 0.3s; }
.elem-bar-fill.matched { background: rgba(80,200,100,0.5); }
.elem-bar-fill.impure { background: rgba(200,80,60,0.3); }
.elem-val { width: 28px; text-align: right; color: rgba(200,180,150,0.6); }
.elem-target { font-size: 10px; color: rgba(180,160,130,0.4); }

.craft-btn {
  padding: 8px 32px; border: 1px solid rgba(200,170,110,0.5); background: rgba(80,60,30,0.4);
  color: #e8d5a0; border-radius: 6px; font-size: 15px; cursor: pointer; font-family: inherit;
  letter-spacing: 2px; transition: all 0.18s;
}
.craft-btn:hover:not(:disabled) { background: rgba(120,90,40,0.5); }
.craft-btn:disabled { opacity: 0.4; cursor: not-allowed; }

.craft-result { font-size: 13px; padding: 6px 12px; border-radius: 4px; max-width: 400px; text-align: center; }
.craft-result.success { color: #8fd4a0; background: rgba(60,120,60,0.15); }
.craft-result.fail { color: #e8a0a0; background: rgba(120,40,30,0.15); }

/* 材料栏 */
.ing-list { margin-bottom: 8px; }
.ing-item { display: flex; align-items: center; gap: 4px; padding: 4px 8px; border: 1px solid rgba(150,120,70,0.2); border-radius: 4px; margin-bottom: 4px; }
.ing-name { flex: 1; font-size: 13px; color: #e8d5a0; }
.ing-btn { width: 20px; height: 20px; border: 1px solid rgba(150,120,70,0.3); background: rgba(40,30,18,0.4); color: rgba(200,180,150,0.6); border-radius: 3px; font-size: 12px; cursor: pointer; }
.ing-count { width: 20px; text-align: center; font-size: 13px; }
.ing-del { width: 20px; height: 20px; border: 1px solid rgba(200,80,60,0.3); background: rgba(60,20,15,0.3); color: rgba(220,120,100,0.5); border-radius: 3px; font-size: 10px; cursor: pointer; }

.material-pool { display: flex; flex-direction: column; gap: 3px; }
.pool-item { display: flex; justify-content: space-between; padding: 4px 8px; border: 1px solid rgba(100,80,50,0.2); border-radius: 4px; cursor: pointer; transition: all 0.15s; font-size: 12px; }
.pool-item:hover { border-color: rgba(200,170,110,0.5); background: rgba(40,32,20,0.4); }
.pool-count { color: rgba(180,160,130,0.5); }

/* ===== 商铺 Tab ===== */
.shop-body { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; }
.shop-section {}
.shop-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.shop-item { display: flex; align-items: center; gap: 6px; padding: 6px 12px; border: 1px solid rgba(150,120,70,0.25); background: rgba(30,24,16,0.5); border-radius: 4px; cursor: pointer; font-size: 13px; transition: all 0.15s; color: #e8d5a0; }
.shop-item:hover { border-color: rgba(200,170,110,0.5); background: rgba(40,32,20,0.6); }
.shop-item.equipped { border-color: rgba(220,190,120,0.6); background: rgba(60,48,28,0.5); }
.shop-price { font-size: 11px; color: rgba(180,160,130,0.5); }
.equipped-tag { font-size: 10px; color: rgba(220,190,120,0.6); }
</style>
