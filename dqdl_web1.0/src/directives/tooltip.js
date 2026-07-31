/**
 * v-tooltip 自定义指令：悬停显示文字提示（跟随鼠标，行为同原生 title）。
 *
 * 用法：
 *   <div v-tooltip="'怪物名'">...</div>
 *   <div v-tooltip="mob.name">...</div>          ← 动态值
 *   <div v-tooltip="'第一行<br/>第二行'">...</div> ← 支持换行（调用方自行加 <br/>）
 *
 * 定位：浮层默认出现在鼠标右下角；右下方放不下（溢出视口）则翻到左上角。
 *       跟随鼠标实时移动（mousemove 更新坐标）。
 * 宽度：浮层不规定宽度，由内容撑开（white-space: nowrap 单行，含 <br/> 时自然换行）。
 *
 * 实现：全局共享一个浮层 DOM（懒创建，appendChild 到 body）。
 *       所有触发元素共用，避免每个元素各建一份。
 */

// 全局共享的浮层元素（懒创建）
let tipEl = null
// 当前正在显示的触发元素（mouseleave 时校验，避免相邻元素切换闪烁）
let currentTarget = null

function getTipEl() {
  if (tipEl) return tipEl
  tipEl = document.createElement('div')
  tipEl.className = 'v-tooltip'
  tipEl.style.display = 'none'
  document.body.appendChild(tipEl)
  return tipEl
}

/** 根据鼠标坐标，把浮层放到光标右下角；溢出视口则翻到左上角。 */
function positionAtMouse(clientX, clientY) {
  const tip = getTipEl()
  // 必须先显示才能测尺寸
  tip.style.visibility = 'hidden'
  tip.style.display = 'block'
  const tipRect = tip.getBoundingClientRect()
  tip.style.visibility = ''

  const gap = 12               // 距光标的偏移（约一个光标宽）
  const margin = 4             // 视口边距

  // 默认右下角
  let left = clientX + gap
  let top = clientY + gap
  // 右侧放不下 → 翻到左侧（光标左上方）
  if (left + tipRect.width > window.innerWidth - margin) {
    left = clientX - gap - tipRect.width
  }
  // 下方放不下 → 翻到上方
  if (top + tipRect.height > window.innerHeight - margin) {
    top = clientY - gap - tipRect.height
  }
  // 夹紧到视口内
  left = Math.max(margin, Math.min(left, window.innerWidth - tipRect.width - margin))
  top = Math.max(margin, Math.min(top, window.innerHeight - tipRect.height - margin))

  tip.style.left = left + 'px'
  tip.style.top = top + 'px'
}

/** 显示浮层（innerHTML 支持 <br/> 换行）。
 *  text 为空/null/undefined 时不显示（避免空浮层）。 */
function show(el, text, evt) {
  if (!text) return               // 空内容不弹浮层
  const tip = getTipEl()
  tip.innerHTML = text
  currentTarget = el
  positionAtMouse(evt.clientX, evt.clientY)
  tip.style.display = 'block'
}

function hide(el) {
  if (currentTarget === el) {
    getTipEl().style.display = 'none'
    currentTarget = null
  }
}

export const vTooltip = {
  mounted(el, binding) {
    // 缓存最新值到 el 上：Vue3 自定义指令的 binding 在 updated 时是新对象，
    // mounted 闭包里捕获的 binding.value 不会随后续更新而变化。
    // 故 enter/move 一律读 el._tooltipValue（mounted/updated 同步），保证拿到最新内容。
    el._tooltipValue = binding.value
    const enter = (evt) => {
      show(el, el._tooltipValue, evt)
      // 挂 mousemove 跟随鼠标（handler 缓存到 el，leave/unmount 时用同一引用解绑）
      const move = (e) => {
        if (currentTarget === el) positionAtMouse(e.clientX, e.clientY)
      }
      el._tooltipMove = move
      window.addEventListener('mousemove', move)
    }
    const leave = () => {
      hide(el)
      if (el._tooltipMove) {
        window.removeEventListener('mousemove', el._tooltipMove)
        el._tooltipMove = null
      }
    }
    el.addEventListener('mouseenter', enter)
    el.addEventListener('mouseleave', leave)
    // 缓存到 el 上，beforeUnmount 解绑用
    el._tooltipEnter = enter
    el._tooltipLeave = leave
  },
  updated(el, binding) {
    // 同步最新值（响应式数据异步加载后值会变，如背包 slots 挂载后才到位）
    el._tooltipValue = binding.value
    // 若正在显示则更新内容
    if (currentTarget === el) {
      getTipEl().innerHTML = binding.value ?? ''
    }
  },
  beforeUnmount(el) {
    // 用缓存的 handler 引用精确解绑（避免移除到别的元素的 handler）
    if (el._tooltipMove) {
      window.removeEventListener('mousemove', el._tooltipMove)
      el._tooltipMove = null
    }
    el.removeEventListener('mouseenter', el._tooltipEnter)
    el.removeEventListener('mouseleave', el._tooltipLeave)
    hide(el)
  },
}
