<script setup>
/**
 * 功法详情浮层：基于 FloatingTooltip（@floating-ui/vue + Teleport）封装。
 *
 * 对外是包裹式 API：用默认 slot 传触发内容，hover 时显示详情。
 * 内部维护 hover 状态 + 当前触发元素 ref，转成 FloatingTooltip 的受控入参。
 *
 * 为什么用 Teleport：功法项祖先 .stats-col 有 overflow:auto，CSS 规范下
 * overflow-y 非 visible 会使 overflow-x 隐式变 auto，绝对定位 tooltip 会被
 * 裁剪并撑出横向滚动条。FloatingTooltip 把浮层 Teleport 到 body 绕开。
 *
 * Props:
 *   technique (object) - 后端聚合的功法详情（name/rank/attribute/level/base_params/...）
 * Slot: 触发元素（功法项内容）
 */
import { ref } from 'vue'
import FloatingTooltip from './FloatingTooltip.vue'

const props = defineProps({
  technique: { type: Object, required: true },
})

/* 触发元素 ref（.tt-trigger 本身） + 显示开关，转成 FloatingTooltip 受控入参 */
const referenceRef = ref(null)
const open = ref(false)

/* ============ 文本格式化 ============ */
const RANK_LABEL = {
  11: '天阶上品', 12: '天阶中品', 13: '天阶下品',
  21: '地阶上品', 22: '地阶中品', 23: '地阶下品',
  31: '玄阶上品', 32: '玄阶中品', 33: '玄阶下品',
  41: '黄阶上品', 42: '黄阶中品', 43: '黄阶下品',
}
const PARAM_LABEL = {
  power: '力量', intelligence: '智力', quick: '敏捷', stamina: '体质', lucky: '运气',
  hp: '气血', energy: '斗气',
}
const rankText = RANK_LABEL[props.technique?.rank] || ''
const name = props.technique?.name || props.technique?.skill_name || '未知'
const baseText = (() => {
  const params = props.technique?.base_params
  if (!params) return ''
  const parts = []
  for (const k of Object.keys(params)) {
    if (PARAM_LABEL[k] && Number(params[k])) parts.push(`${PARAM_LABEL[k]}+${params[k]}`)
  }
  return parts.join(' / ')
})()
</script>

<template>
  <div
    ref="referenceRef"
    class="tt-trigger"
    @pointerenter="open = true"
    @pointerleave="open = false"
    @focusin="open = true"
    @focusout="open = false"
  >
    <slot />

    <FloatingTooltip
      v-model:open="open"
      :reference="referenceRef"
      placement="right-start"
    >
      <div class="tt-name">
        {{ name }}
      </div>
      <div
        v-if="rankText || technique.attribute"
        class="tt-meta"
      >
        {{ rankText }}<template v-if="rankText && technique.attribute">
          ·
        </template>{{ technique.attribute ? technique.attribute + '属性' : '' }}
      </div>
      <div
        v-if="baseText"
        class="tt-base"
      >
        {{ baseText }}
      </div>
      <div class="tt-progress">
        修为 {{ technique.cultivation ?? 0 }}/{{ technique.max_cultivation || 0 }}
        <template v-if="technique.max_level">
          · 最高 Lv.{{ technique.max_level }}
        </template>
      </div>
      <div
        v-if="technique.equipped"
        class="tt-equipped"
      >
        已装备
      </div>
      <div
        v-if="technique.description"
        class="tt-desc"
      >
        {{ technique.description }}
      </div>
    </FloatingTooltip>
  </div>
</template>

<style scoped>
/* 触发元素：作为 .technique-list(flex column) 的子项包裹功法项内容 */
.tt-trigger {
  display: block;
}

/* 功法浮层内容样式（浮层外壳由 FloatingTooltip 提供，Teleport 到 body；
   这些 class 打在本组件模板元素上，scoped 属性随元素走，仍能匹配） */
.tt-name {
  font-size: 13px;
  color: #e8d5a0;
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  margin-bottom: 4px;
}
.tt-meta {
  font-size: 10px;
  color: rgba(210, 180, 120, 0.8);
  margin-bottom: 3px;
}
.tt-base {
  font-size: 11px;
  color: #9fc880;
  margin-bottom: 3px;
  font-family: 'Georgia', serif;
}
.tt-progress {
  font-size: 10px;
  color: rgba(200, 170, 110, 0.7);
  margin-bottom: 3px;
}
.tt-equipped {
  display: inline-block;
  font-size: 10px;
  color: #e8d5a0;
  padding: 0 5px;
  margin-bottom: 4px;
  background: rgba(160, 130, 70, 0.3);
  border: 1px solid rgba(160, 130, 70, 0.5);
  border-radius: 8px;
}
.tt-desc {
  font-size: 10px;
  line-height: 1.5;
  color: rgba(190, 175, 145, 0.85);
  word-break: break-all;
}
</style>
