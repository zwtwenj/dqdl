<script setup>
import { bus, BusEvents } from '@/utils/eventBus'

/** 点击奇遇按钮 → 打开奇遇列表弹窗（全局原子组件监听 ADVENTURE_OPEN） */
function onAdventureClick() {
    bus.emit(BusEvents.ADVENTURE_OPEN)
}
</script>

<template>
    <div class="game-view-footer">
        <div class="footer-button" @click="onAdventureClick">
            奇遇
        </div>
    </div>
</template>

<style lang="less" scoped>
.game-view-footer {
    width: 100%;
    height: 33px;
    background: var(--img-bottom-bar) repeat-x;
    padding: 0 10px;
    .footer-button{
        color: #d7d2d3;
        font-size: var(--fs-lg);
        line-height: 25px;
        padding: 4px 10px;
    }
    .footer-button:hover{
        color: var(--text-light);
        cursor: pointer;
    }
}
</style>