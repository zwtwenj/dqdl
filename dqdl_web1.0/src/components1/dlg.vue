<script setup>
import { defineProps, computed, defineEmits } from 'vue';
import { nextZIndex } from '@/stores/ui'

const props = defineProps({
    title: {
        type: String,
        default: ''
    },
    contentStyleProp: {
        type: Object,
        default: () => ({})
    }
})

const contentStyle = computed(() => {
    const style = {
        width: "410px",
        minHeight: "100px",
        lineHeight: "20px"
    }
    return Object.assign(style, props.contentStyleProp)
})

// 组件实例创建时取递增 z-index，绑到最外层内联样式：
// 后创建的弹窗 zIndex 更大，永远盖在先创建的之上
const zIndex = nextZIndex()

const emits = defineEmits(['close'])

const closeDlg = () => {
    emits('close')
}
</script>

<template>
    <div class="dlg-bg" :style="{ zIndex }">
        <div class="dlg-frame">
            <div class="dlg-frame-top-left"></div>
            <div class="dlg-frame-top-right"></div>
            <div class="dlg-frame-bottom-left"></div>
            <div class="dlg-frame-bottom-right"></div>
            <div class="dlg-title">{{ title }}</div>
            <div class="dlg-close" @click="closeDlg"></div>
            <div class="dlg-frame-content" :style="contentStyle">
                <slot></slot>
            </div>
        </div>
    </div>
</template>

<style lang="less" scoped>
.dlg-bg{
    position: fixed;
    height: 100%;
    width: 100%;
    background: rgba(121, 114, 108, 0.5);
    /* z-index 由内联样式注入（来自 ui store 的递增值），这里不写死 */
    top: 0;
    left: 0;
    display: flex;
}
.dlg-frame{
    border: 1px solid var(--border-mid);
    padding: 1px;
    background: var(--panel-bg-soft);
    display: inline-block;
    margin: auto;
    position: relative;
}
.dlg-title{
    background: var(--img-caption) center center no-repeat;
    position: absolute;
    float: left;
    top: -12px;
    padding: 0;
    color: var(--accent);
    font-weight: bold;
    text-align: center;
    width: 100%;
    height: 25px;
    line-height: 25px;
}
.dlg-close{
    background: var(--img-close) no-repeat center;
    position: absolute;
    top: -10px;
    right: 5px;
    float: right;
    width: 20px;
    height: 21px;
    cursor: pointer;
    z-index: 10;
}
.dlg-frame-content{
    padding: 20px 15px 15px 15px;
    width: 410px;
    text-align: center;
    position: relative;
    z-index: 3;
}
.dlg-frame-top-left, .dlg-frame-top-right, .dlg-frame-bottom-left, .dlg-frame-bottom-right{
    position: absolute;
    width: 100%;
    height: 100%;
}
.dlg-frame-top-left{
    background: url(http://static.hero.9wee.com/styles/default/dlg-left-top.gif) left top no-repeat;
}
.dlg-frame-top-right{
    background: url(http://static.hero.9wee.com/styles/default/dlg-right-top.gif) right top no-repeat;
}
.dlg-frame-bottom-left{
    background: url(http://static.hero.9wee.com/styles/default/dlg-left-bottom.gif) left bottom no-repeat;
}
.dlg-frame-bottom-right{
    background: url(http://static.hero.9wee.com/styles/default/dlg-right-bottom.gif) right bottom no-repeat;
}
</style>