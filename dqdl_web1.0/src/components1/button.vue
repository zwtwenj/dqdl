<script setup>
</script>

<template>
    <div class="dqdl-button">
        <slot></slot>
    </div>
</template>

<style lang="less" scoped>
.dqdl-button{
    background: var(--img-btn) no-repeat;
    text-align: center;
    width: 102px;
    height: 27px;
    line-height: 27px;
    display: inline-block;
    cursor: pointer;
    color: #7f5644;
}
.dqdl-button:hover{
    background: var(--img-btn-hover) no-repeat;
    color: var(--accent-hover);
}
</style>