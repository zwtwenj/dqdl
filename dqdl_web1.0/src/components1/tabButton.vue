<script setup>
import { defineProps } from 'vue';

const props = defineProps({
    isActive: {
        type: Boolean,
        default: false
    }
})
</script>

<template>
    <div class="tab-button" :class="{ isActive: isActive}">
        <slot></slot>
    </div>
</template>

<style lang="less" scoped>
.tab-button{
    background: url("/static/switch-button.gif") no-repeat;
    float: left;
    width: 100px;
    height: 27px;
    line-height: 27px;
    text-align: center;
    text-decoration: none;
    color: #d7d1ca;
    margin-right: 10px;
    cursor: pointer;
}
.isActive{
    background: url("/static/switch-button-highlight.gif") no-repeat;
    color: var(--danger);
    font-weight: bold;
}
</style>