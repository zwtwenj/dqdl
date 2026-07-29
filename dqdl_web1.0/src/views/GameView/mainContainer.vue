<script setup>
import TabButton from '@/components1/tabButton.vue';
import Backpack from './backpack.vue';
import { defineProps } from 'vue';
import { ref } from 'vue';
import { watch } from 'vue';

const props = defineProps({
    defaultTab: {
        type: String,
        default: 'player'
    }
})

const tabs = [
    { title: '人物', value: 'player' },
    { title: '背包', value: 'backpack' },
    { title: '斗技', value: 'skill' }
]

const tabActive = ref('player')

const emits = defineEmits(['close'])
const close = () => {
    emits('close')
}

watch(() => props.defaultTab, () => {
    tabActive.value = props.defaultTab
}, {
    immediate: true
})
</script>

<template>
    <div class="main-container">
        <div class="border-top"></div>
        <div class="border-bottom"></div>
        <div class="main-container-close" @click="close"></div>
        <div class="main-content-border">
            <div class="main-content">
                <div class="tab-menu">
                    <TabButton :isActive="tabActive == tab.value"
                    v-for="tab in tabs"
                    @click="tabActive=tab.value">
                        {{ tab.title }}
                    </TabButton>
                </div>
                <div class="tab-content">
                    <Backpack v-if="tabActive == 'backpack'"></Backpack>
                </div>
            </div>
        </div>
    </div>
</template>

<style lang="less" scoped>
.main-container{
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: #e9e5dc;
    .border-top, .border-bottom{
        background: url("/static/border-top.gif") repeat-x;
        height: 11px;
        margin: -3px 0 0 25px;
        width: 95%;
        position: absolute;
    }
    .border-bottom{
        bottom: -5px;
    }
    .main-container-close{
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
    .main-content-border{
        border: 1px solid #847375;
        padding: 1px;
        height: 100%;
    }
    .main-content{
        border: 1px solid #847375;
        width: 100%;
        height: 100%;
        position: relative;
        .tab-menu{
            position: absolute;
            margin: -14px 0 0 36px;
        }
        .tab-content{
            padding: 17px 10px 0 10px;
            height: 100%;
            width: 100%;
        }
    }
}
</style>