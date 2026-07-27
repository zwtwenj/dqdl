<script setup>
</script>

<template>
    <div class="module-box">
        <div class="module-top">
            <div class="module-top-left"></div>
            <div class="module-top-right"></div>
        </div>
        <div class="module-content">
            <div class="module-content-left"></div>
            <div class="module-content-center">
                <slot></slot>
            </div>
            <div class="module-content-right"></div>
        </div>
        <div class="module-bottom">
            <div class="module-bottom-left"></div>
            <div class="module-bottom-right"></div>
        </div>
    </div>
</template>

<style lang="less" scoped>
.module-box{

}
.module-top{
    height: 14px;
    width: 100%;
    background: url("/static/stage-top-bg.gif") left top repeat-x;
    display: flex;
    justify-content: space-between;
    .module-top-left{
        width: 14px;
        height: 14px;
        background: var(--panel-bg-deep) url("/static/stage-top-left.gif") left top no-repeat;
    }
    .module-top-right{
        width: 14px;
        height: 14px;
        background: var(--panel-bg-deep) url("/static/stage-top-right.gif") right top no-repeat;
    }
}
.module-bottom{
    height: 14px;
    width: 100%;
    background: url("/static/stage-bottom-bg.gif") left bottom repeat-x;
    display: flex;
    justify-content: space-between;
    .module-bottom-left{
        width: 14px;
        height: 14px;
        background: var(--panel-bg-deep) url("/static/stage-bottom-left.gif") left bottom no-repeat;
    }
    .module-bottom-right{
        width: 14px;
        height: 14px;
        background: var(--panel-bg-deep) url("/static/stage-bottom-right.gif") right bottom no-repeat;
    }
}
.module-content{
    display: flex;
    background: var(--panel-bg);
    .module-content-center{
        flex: 1;
    }
    .module-content-left{
        width: 12px;
        background: url("/static/stage-left-bg.gif") left top repeat-y;
    }
    .module-content-right{
        width: 12px;
        background: url("/static/stage-right-bg.gif") right top repeat-y;
    }
}
</style>