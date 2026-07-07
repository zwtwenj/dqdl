<script setup>
import { computed } from 'vue'

/**
 * 存档选择弹窗：新游戏时选一个空槽位开始；继续游戏时选已有存档。
 * 三栏左中右排列，每个槽位一张卡片。空槽位显示"+ 新建"，已占用显示存档信息。
 *
 * Props:
 *   modelValue (boolean) - 是否显示
 *   saves (Array)        - 存档列表 [{ slot, name, content, updated_at }]
 *   mode (string)        - 'new' 新游戏（空槽可点，已有存档灰显）
 *                          'continue' 继续游戏（已有存档可点，空槽灰显）
 * Emits:
 *   update:modelValue    - 关闭弹窗
 *   select (slot)        - 选中某个槽位
 */
const props = defineProps({
  modelValue: Boolean,
  saves: { type: Array, default: () => [] },
  mode: { type: String, default: 'new' },
})
const emit = defineEmits(['update:modelValue', 'select'])

/** 三个固定槽位，合并存档数据 */
const slots = computed(() => {
  return [1, 2, 3].map((n) => {
    const save = props.saves.find((s) => s.slot === n)
    return {
      slot: n,
      empty: !save,
      save,
    }
  })
})

/** 槽位是否可选（根据模式） */
function isSelectable(item) {
  if (props.mode === 'new') return item.empty      // 新游戏只能选空槽
  return !item.empty                                // 继续游戏只能选已有
}

function onSelect(item) {
  if (!isSelectable(item)) return
  emit('select', item.slot)
}

function close() {
  emit('update:modelValue', false)
}

/** 格式化存档时间 */
function fmtTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="modelValue"
      class="save-overlay"
      @click.self="close"
    >
      <div class="save-modal">
        <h2 class="save-title">
          {{ mode === 'new' ? '选择存档位置' : '选择存档' }}
        </h2>

        <div class="slots-row">
          <div
            v-for="item in slots"
            :key="item.slot"
            class="slot-card"
            :class="{
              'is-empty': item.empty,
              'is-occupied': !item.empty,
              'is-disabled': !isSelectable(item),
            }"
            @click="onSelect(item)"
          >
            <!-- 空槽位 -->
            <template v-if="item.empty">
              <div class="slot-plus">
                +
              </div>
              <div class="slot-label">
                空位 {{ item.slot }}
              </div>
              <div
                v-if="mode === 'new'"
                class="slot-hint"
              >
                点击开始新游戏
              </div>
              <div
                v-else
                class="slot-hint dim"
              >
                无存档
              </div>
            </template>

            <!-- 已占用槽位 -->
            <template v-else>
              <div class="slot-header">
                <span class="slot-num">存档 {{ item.slot }}</span>
              </div>
              <div class="slot-name">
                {{ item.save.name }}
              </div>
              <div class="slot-meta">
                <span>最后游玩</span>
                <span class="slot-time">{{ fmtTime(item.save.updated_at) }}</span>
              </div>
              <div
                v-if="mode === 'new'"
                class="slot-hint dim"
              >
                已被占用
              </div>
              <div
                v-else
                class="slot-hint"
              >
                点击继续游戏
              </div>
            </template>
          </div>
        </div>

        <button
          class="save-close"
          @click="close"
        >
          取消
        </button>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* 0.8 * 0.8 屏幕比例的遮罩 */
.save-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

/* 弹窗主体：0.8 屏幕宽 × 0.8 屏幕高 */
.save-modal {
  width: 80vw;
  height: 80vh;
  max-width: 1000px;
  background: rgba(18, 14, 10, 0.92);
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 8px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.8), inset 0 1px 0 rgba(200, 170, 110, 0.15);
  display: flex;
  flex-direction: column;
  padding: 28px 32px 24px;
}

.save-title {
  text-align: center;
  font-size: 26px;
  letter-spacing: 6px;
  margin: 0 0 28px;
  color: #e8d5a0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-weight: normal;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
}

/* 三栏左中右排列，等分，有间隔 */
.slots-row {
  flex: 1;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: stretch;
}

.slot-card {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px 16px;
  background: rgba(30, 24, 16, 0.6);
  border: 1px solid rgba(150, 120, 70, 0.35);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;
}

.slot-card.is-empty {
  border-style: dashed;
  border-color: rgba(150, 120, 70, 0.3);
}

.slot-card.is-occupied {
  border-style: solid;
  background: rgba(35, 28, 18, 0.7);
}

.slot-card.is-disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.slot-card:not(.is-disabled):hover {
  border-color: rgba(212, 175, 106, 0.7);
  background: rgba(45, 36, 22, 0.8);
  box-shadow: 0 0 16px rgba(212, 175, 106, 0.2);
  transform: translateY(-2px);
}

/* 空槽位 */
.slot-plus {
  font-size: 48px;
  color: rgba(180, 150, 90, 0.5);
  line-height: 1;
  margin-bottom: 4px;
}

.slot-label {
  font-size: 16px;
  color: #c0a878;
  letter-spacing: 2px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

/* 已占用槽位 */
.slot-header {
  font-size: 13px;
  color: rgba(200, 170, 110, 0.6);
  letter-spacing: 1px;
  margin-bottom: 4px;
}

.slot-name {
  font-size: 20px;
  color: #e8d5a0;
  letter-spacing: 2px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  margin-bottom: 12px;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.6);
}

.slot-meta {
  font-size: 12px;
  color: rgba(180, 160, 130, 0.6);
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.slot-time {
  color: rgba(200, 170, 110, 0.5);
}

.slot-hint {
  margin-top: 8px;
  font-size: 13px;
  color: #8ab870;
  letter-spacing: 1px;
}

.slot-hint.dim {
  color: rgba(150, 130, 90, 0.4);
}

/* 取消按钮 */
.save-close {
  align-self: center;
  margin-top: 24px;
  padding: 6px 32px;
  font-size: 14px;
  color: rgba(200, 180, 140, 0.7);
  background: transparent;
  border: 1px solid rgba(180, 150, 90, 0.3);
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.2s;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  letter-spacing: 4px;
}

.save-close:hover {
  color: #e8d5a0;
  border-color: rgba(212, 175, 106, 0.6);
}
</style>
