<script setup>
</script>

<template>
    <div class="quick-button">
        <slot></slot>
    </div>
</template>

<style lang="less" scoped>
.quick-button{
    background: var(--img-quick-btn) no-repeat;
    background-size: 100% 100%;
    text-align: center;
    color: var(--text-light);
    font-size: var(--fs-sm);
    padding: 4px 0 7px 0;
    cursor: pointer;
    display: inline-block;
}
.quick-button:hover{
    background: var(--img-quick-btn-hover) no-repeat;
    background-size: 100% 100%;
}
</style>
