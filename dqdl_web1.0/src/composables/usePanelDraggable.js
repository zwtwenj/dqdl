import { onUnmounted, ref } from 'vue'

/**
 * 弹窗拖拽 hook（pointer events，兼容鼠标/触摸）。
 *
 * 用法：
 *   const panelRef = ref(null)
 *   const pos = ref(null)            // null = 沿用 CSS 默认定位
 *   const { onHandlePointerDown, dragging } = usePanelDraggable({
 *     elRef: panelRef,
 *     pos,
 *     onStart,                        // 可选：拖拽开始回调（如 focus 层级）
 *   })
 *
 *   // 在模板里：把 onHandlePointerDown 绑到"手柄"元素（标题栏/顶边框）。
 *   // 手柄外的区域不触发拖拽，避免与弹窗内部交互冲突。
 *
 * 边界约束：拖拽过程中面板不超出父容器边界（panelRef 的 offsetParent）。
 *
 * @param {object}   opts
 * @param {Ref<HTMLElement|null>} opts.elRef    弹窗根元素 ref
 * @param {Ref<{x:number,y:number}|null>} opts.pos  位置状态（v-model 受控）
 * @param {function} [opts.onStart]              拖拽开始回调
 */
export function usePanelDraggable({ elRef, pos, onStart }) {
  const dragging = ref(false)

  let origin = null      // { px, py } 按下时的指针坐标
  let start = null       // { x, y }   按下时面板的 left/top
  let parentRect = null  // 按下时父容器的视口矩形

  function onPointerMove(e) {
    if (!origin) return
    const dx = e.clientX - origin.px
    const dy = e.clientY - origin.py
    // start 是 offsetParent 坐标系（来自 offsetLeft/Top），增量也是像素差，
    // 所以 nx/ny 仍在 offsetParent 坐标系。
    let nx = start.x + dx
    let ny = start.y + dy

    // 边界约束：面板不超出父容器边界（offsetParent 坐标系）
    if (parentRect) {
      const el = elRef.value
      if (el) {
        const w = el.offsetWidth
        const h = el.offsetHeight
        nx = Math.min(Math.max(nx, 0), Math.max(0, parentRect.width - w))
        ny = Math.min(Math.max(ny, 0), Math.max(0, parentRect.height - h))
      }
    }

    pos.value = { x: nx, y: ny }
  }

  function onPointerUp() {
    if (!dragging.value) return
    dragging.value = false
    origin = null
    start = null
    parentRect = null
    window.removeEventListener('pointermove', onPointerMove)
    window.removeEventListener('pointerup', onPointerUp)
  }

  /**
   * 绑定到手柄元素的 pointerdown 处理。
   * @param {PointerEvent} e
   */
  function onHandlePointerDown(e) {
    // 只响应主键（左键 / 触摸）
    if (e.button !== 0 && e.pointerType === 'mouse') return
    const el = elRef.value
    if (!el) return

    // 首次拖拽：把 CSS 默认定位（right/bottom）解析成显式 left/top
    const rect = el.getBoundingClientRect()
    const parent = el.offsetParent
    if (!parent) return
    parentRect = parent.getBoundingClientRect()

    let curX, curY
    if (pos.value) {
      curX = pos.value.x
      curY = pos.value.y
    } else {
      // 用当前渲染位置作为起点（相对于 offsetParent）
      curX = el.offsetLeft
      curY = el.offsetTop
      pos.value = { x: curX, y: curY }
    }

    start = { x: curX, y: curY }
    origin = { px: e.clientX, py: e.clientY }
    dragging.value = true

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onPointerUp)

    onStart && onStart()
    // 阻止默认行为，避免文本选中/图片拖拽
    e.preventDefault()
  }

  onUnmounted(onPointerUp)

  return { dragging, onHandlePointerDown }
}
