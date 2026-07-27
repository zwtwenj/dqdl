<script setup>
/**
 * 通用浮层 tooltip：@floating-ui/vue 定位 + <Teleport to="body"> 渲染。
 *
 * 解决的问题：调用方祖先容器常有 overflow:auto（如 .bag-content / .stats-col），
 * CSS 规范下 overflow-y 非 visible 会使 overflow-x 隐式变 auto，绝对定位 tooltip
 * 会被裁剪并撑出横向滚动条。Teleport 到 body 可绕开任意祖先 overflow。
 *
 * 受控式设计：本组件只负责「浮层」（定位 + Teleport + 进入/离开延时），不包裹
 * 触发元素，以免改变调用方 DOM 结构（背包格子有 draggable 等属性、且 35 格共享
 * 一个浮层更省）。调用方：
 *   1) 把触发元素的 DOM ref 通过 `:reference` 传入；
 *   2) 用 v-model:open 控制显隐，在触发元素上绑 hover/focus 事件切换；
 *   3) 浮层内容通过默认 slot 传入。
 *
 * Props:
 *   reference (HTMLElement|null) - 触发元素（定位参考）
 *   placement (string)           - 初始方位，默认 'top'
 *   skinClass (string)           - 浮层外壳附加类名（用于覆盖默认浮层样式，
 *                                  因 Teleport 到 body，scoped 样式无法穿透）
 * Slot:
 *   default - 浮层内容
 * Emits:
 *   update:open (boolean) - 浮层显隐变化（含 80ms 延迟关闭，支持 v-model:open）
 */
import { ref, watch } from 'vue'
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/vue'

const props = defineProps({
  reference: { type: Object, default: null },
  placement: { type: String, default: 'top' },
  open: { type: Boolean, default: false },
  skinClass: { type: String, default: '' },
})
const emit = defineEmits(['update:open'])

const floatingRef = ref(null)

// useFloating 直接读 reference.value 取元素（非 toValue），故第一参数必须是 ref。
// props.reference 是父组件传入的裸 DOM 元素值（prop 解包后非 ref），
// 这里用一个本地 ref 同步它，保证响应式追踪 + .value 取值正确。
const referenceRef = ref(null)
watch(
  () => props.reference,
  (el) => {
    referenceRef.value = el
  },
  { immediate: true },
)

const { floatingStyles, placement } = useFloating(referenceRef, floatingRef, {
  placement: props.placement,
  middleware: [offset(6), flip(), shift({ padding: 8 })],
  whileElementsMounted: autoUpdate,
})

/* 80ms 延迟关闭：鼠标在 reference↔floating 间移动时不抖动 */
let closeTimer = null
function requestClose() {
  if (closeTimer) clearTimeout(closeTimer)
  closeTimer = setTimeout(() => emit('update:open', false), 80)
}
function cancelClose() {
  if (closeTimer) {
    clearTimeout(closeTimer)
    closeTimer = null
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      ref="floatingRef"
      class="ft-floating"
      :class="skinClass"
      :style="floatingStyles"
      :data-placement="placement"
      @pointerenter="cancelClose"
      @pointerleave="requestClose"
    >
      <slot />
    </div>
  </Teleport>
</template>

<style scoped>
.ft-floating {
  position: absolute;
  z-index: 9999;
  width: 160px;
  padding: 6px 9px;
  background: rgba(15, 12, 8, 0.97);
  border: 1px solid rgba(200, 170, 100, 0.5);
  border-radius: 4px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.8);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-align: center;
  pointer-events: auto;
}
</style>
