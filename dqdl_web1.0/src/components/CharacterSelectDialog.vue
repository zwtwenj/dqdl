<script setup>
import { computed } from 'vue'

/**
 * 角色选择弹窗（网游模式）。
 * 登录后弹出：空槽位显示"+ 创建角色"，已有角色显示角色信息+进入。
 * 已有角色右上角有删除按钮（不影响 slot 位置）。
 *
 * Props:
 *   modelValue (boolean) - 是否显示
 *   characters (Array)   - 角色列表 [{ id, slot, name, updated_at }]
 * Emits:
 *   update:modelValue - 关闭
 *   select (slot)     - 选已有角色进入游戏
 *   create (slot)     - 选空位创建新角色
 *   delete (character)- 删除角色
 */
const props = defineProps({
  modelValue: Boolean,
  characters: { type: Array, default: () => [] },
})
const emit = defineEmits(['update:modelValue', 'select', 'create', 'delete'])

/** 三个固定槽位，合并角色数据 */
const slots = computed(() => {
  return [1, 2, 3].map((n) => {
    const character = props.characters.find((c) => c.slot === n)
    return { slot: n, empty: !character, character }
  })
})

function onSelect(item) {
  if (item.empty) {
    emit('create', item.slot)
  } else {
    emit('select', item.slot)
  }
}

function onDelete(e, character) {
  e.stopPropagation()
  if (!confirm(`确定删除角色「${character.name}」吗？此操作不可恢复。`)) return
  emit('delete', character)
}

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
      class="overlay"
    >
      <div class="modal">
        <h2 class="title">
          选择角色
        </h2>

        <div class="slots-row">
          <div
            v-for="item in slots"
            :key="item.slot"
            class="slot-card"
            :class="{ 'is-empty': item.empty, 'is-occupied': !item.empty }"
            @click="onSelect(item)"
          >
            <!-- 删除按钮（仅已有角色，右上角） -->
            <button
              v-if="!item.empty"
              class="slot-delete"
              title="删除角色"
              @click="onDelete($event, item.character)"
            >
              ×
            </button>

            <!-- 空槽位 -->
            <template v-if="item.empty">
              <div class="slot-plus">
                +
              </div>
              <div class="slot-label">
                空位 {{ item.slot }}
              </div>
              <div class="slot-hint">
                点击创建角色
              </div>
            </template>

            <!-- 已有角色 -->
            <template v-else>
              <div class="slot-header">
                <span>角色 {{ item.slot }}</span>
              </div>
              <div class="slot-name">
                {{ item.character.name }}
              </div>
              <div class="slot-meta">
                <span>最后游玩</span>
                <span class="slot-time">{{ fmtTime(item.character.updated_at) }}</span>
              </div>
              <div class="slot-hint">
                点击进入游戏
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
}

.modal {
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

.title {
  text-align: center;
  font-size: 26px;
  letter-spacing: 6px;
  margin: 0 0 28px;
  color: #e8d5a0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  font-weight: normal;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.6);
}

.slots-row {
  flex: 1;
  display: flex;
  justify-content: space-between;
  gap: 24px;
  align-items: stretch;
}

.slot-card {
  position: relative;
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

.slot-card:hover {
  border-color: rgba(212, 175, 106, 0.7);
  background: rgba(45, 36, 22, 0.8);
  box-shadow: 0 0 16px rgba(212, 175, 106, 0.2);
  transform: translateY(-2px);
}

.slot-delete {
  position: absolute;
  top: 8px;
  right: 8px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  line-height: 1;
  color: rgba(200, 170, 110, 0.4);
  background: rgba(30, 20, 15, 0.6);
  border: 1px solid rgba(150, 120, 70, 0.3);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}

.slot-delete:hover {
  color: #ff7060;
  border-color: rgba(255, 100, 80, 0.6);
  background: rgba(60, 20, 15, 0.8);
}

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
</style>
