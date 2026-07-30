<script setup>
import { defineProps, computed, defineEmits, ref } from 'vue';
import { nextZIndex } from '@/stores/ui'
import TabButton from './tabButton.vue'

const props = defineProps({
    title: {
        type: String,
        default: ''
    },
    contentStyleProp: {
        type: Object,
        default: () => ({})
    },
    // 标签栏：[{ text, value }]。存在时不显示 title，改为顶部 tabButton 块
    tabs: {
        type: Array,
        default: () => []
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

// 是否用 tabs 模式（有 tabs 且非空）
const hasTabs = computed(() => Array.isArray(props.tabs) && props.tabs.length > 0)

// 当前激活的 tab（默认第一个）
const activeTab = ref('')
if (hasTabs.value) {
    activeTab.value = props.tabs[0].value
}

// 组件实例创建时取递增 z-index，绑到最外层内联样式：
// 后创建的弹窗 zIndex 更大，永远盖在先创建的之上
const zIndex = nextZIndex()

const emits = defineEmits(['close', 'tab-change'])

const closeDlg = () => {
    emits('close')
}

const onTabClick = (tab) => {
    activeTab.value = tab.value
    emits('tab-change', tab.value)
}
</script>

<template>
    <div class="dlg-bg" :style="{ zIndex }">
        <div class="dlg-frame">
            <div class="dlg-frame-top-left"></div>
            <div class="dlg-frame-top-right"></div>
            <div class="dlg-frame-bottom-left"></div>
            <div class="dlg-frame-bottom-right"></div>
            <!-- 有 tabs 时顶部显示标签栏，否则显示标题 -->
            <div v-if="hasTabs" class="dlg-tabs">
                <TabButton
                    v-for="tab in tabs"
                    :key="tab.value"
                    :isActive="activeTab === tab.value"
                    @click="onTabClick(tab)"
                >{{ tab.text }}</TabButton>
            </div>
            <div v-else class="dlg-title">{{ title }}</div>
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
/* tabs 模式：顶部标签栏，居中排列（清 TabButton 的 float:left） */
.dlg-tabs{
    position: absolute;
    top: -14px;
    left: 0;
    width: 100%;
    text-align: left;
    z-index: 4;
    padding-left: 10px;
}
.dlg-tabs :deep(.tab-button){
    float: none;
    display: inline-block;
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