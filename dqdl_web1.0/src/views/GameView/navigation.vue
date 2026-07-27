<script setup>

</script>

<template>
    <div class="game-view-navigation">
        <div class="navigation-left">斗气大陆</div>
        <div class="navigation-right">
            2026年7月26日 03:55:48
        </div>
    </div>
</template>

<style lang="less" scoped>
.game-view-navigation {
    width: 100%;
    background: var(--img-top-bar) bottom repeat-x;;
    height: 28px;
    display: flex;
    justify-content: space-between;
    padding: 0 10px;
    .navigation-left, .navigation-right{
        color: var(--text-light);
        font-size: var(--fs-sm);
        line-height: 20px;
        padding: 4px 0;
    }
}
</style>