<script setup>
</script>

<template>
    <div class="quick-button">
        <slot></slot>
    </div>
</template>

<style lang="less" scoped>
.quick-button{
    background: url("/static/long-button-bg.gif") no-repeat;
    background-size: 100% 100%;
    text-align: center;
    color: var(--text-light);
    font-size: var(--fs-sm);
    cursor: pointer;
    width: 94px;
    height: 21px;
    color: #e9e5dc;
    line-height: 21px;
}
.quick-button:hover{
    background: url("/static/long-button-bg-highlight.gif") no-repeat;
    background-size: 100% 100%;
}
</style>
