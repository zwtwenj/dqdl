<script setup>
/**
 * 通用确认弹窗（仿 dlg.vue 视觉风格）。在 App.vue 挂载一次即可全局可用。
 *
 * 推荐函数式调用：
 *   import { confirm } from '@/components1/confirm'
 *   const ok = await confirm({ title: '提示', content: '确定删除？' })
 *   if (ok) { ... }
 *
 * 实现：confirm() 往模块级响应式 confirmHolder 塞配置并返回 Promise，
 * 本组件直接渲染 confirmHolder，按钮点击时调 resolveConfirm 结束 Promise。
 */
import Button from '@/components1/button.vue'
import { confirmHolder, resolveConfirm } from '@/components1/confirm.js'

function onOk() {
  resolveConfirm(true)
}
// 取消 / 点遮罩 / 关闭按钮 → 一律 resolve(false)，调用方只需判断真假
function onCancel() {
  resolveConfirm(false)
}
</script>

<template>
    <!-- 仿 dlg.vue 外壳：遮罩 + 边框 + 标题栏 + 关闭 + 角块装饰 -->
    <div v-if="confirmHolder" class="confirm-bg"
        :style="{ zIndex: confirmHolder.zIndex }"
        @click.self="onCancel">
        <div class="confirm-frame">
            <div class="confirm-frame-top-left"></div>
            <div class="confirm-frame-top-right"></div>
            <div class="confirm-frame-bottom-left"></div>
            <div class="confirm-frame-bottom-right"></div>
            <div class="confirm-title">{{ confirmHolder.title || '提示' }}</div>
            <div class="confirm-close" @click="onCancel"></div>
            <div class="confirm-content">
                <div class="confirm-text">{{ confirmHolder.content }}</div>
                <div class="confirm-actions">
                    <Button class="confirm-btn" @click="onOk">{{ confirmHolder.okText || '确定' }}</Button>
                    <Button class="confirm-btn" @click="onCancel">{{ confirmHolder.cancelText || '取消' }}</Button>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="less" scoped>
/* 视觉与 dlg.vue 完全一致，仅改 class 前缀避免冲突 */
.confirm-bg{
    position: fixed;
    height: 100%;
    width: 100%;
    background: rgba(121, 114, 108, 0.5);
    /* z-index 由内联样式注入（来自 ui store 的递增值），这里不写死 */
    top: 0;
    left: 0;
    display: flex;
}
.confirm-frame{
    border: 1px solid var(--border-mid);
    padding: 1px;
    background: var(--panel-bg-soft);
    display: inline-block;
    margin: auto;
    position: relative;
}
.confirm-title{
    background: var(--img-caption) center center no-repeat;
    position: absolute;
    top: -12px;
    color: var(--accent);
    font-weight: bold;
    text-align: center;
    width: 100%;
    height: 25px;
    line-height: 25px;
}
.confirm-close{
    background: var(--img-close) no-repeat center;
    position: absolute;
    top: -10px;
    right: 5px;
    width: 20px;
    height: 21px;
    cursor: pointer;
}
.confirm-content{
    padding: 28px 30px 18px 30px;
    width: 360px;
    text-align: center;
    position: relative;
    z-index: 3;
    .confirm-text{
        font-size: var(--fs-md);
        color: var(--text);
        line-height: 22px;
        min-height: 22px;
        margin-bottom: 18px;
    }
    .confirm-actions{
        display: flex;
        justify-content: center;
        gap: 16px;
    }
}
.confirm-frame-top-left, .confirm-frame-top-right, .confirm-frame-bottom-left, .confirm-frame-bottom-right{
    position: absolute;
    width: 100%;
    height: 100%;
}
.confirm-frame-top-left{
    background: url(http://static.hero.9wee.com/styles/default/dlg-left-top.gif) left top no-repeat;
}
.confirm-frame-top-right{
    background: url(http://static.hero.9wee.com/styles/default/dlg-right-top.gif) right top no-repeat;
}
.confirm-frame-bottom-left{
    background: url(http://static.hero.9wee.com/styles/default/dlg-left-bottom.gif) left bottom no-repeat;
}
.confirm-frame-bottom-right{
    background: url(http://static.hero.9wee.com/styles/default/dlg-right-bottom.gif) right bottom no-repeat;
}
</style>
