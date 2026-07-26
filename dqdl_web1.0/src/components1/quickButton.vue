<script setup>
</script>

<template>
    <div class="quick-button">
        <slot></slot>
    </div>
</template>

<style lang="less" scoped>
.quick-button{
    background: url("/static/quick-button.gif") no-repeat;
    background-size: 100% 100%;
    text-align: center;
    color: #e9e5dc;
    font-size: 12px;
    padding: 4px 0 7px 0;
    cursor: pointer;
}
.quick-button:hover{
    background: url("/static/quick-button-hover.gif") no-repeat;
    background-size: 100% 100%;
}
</style>
