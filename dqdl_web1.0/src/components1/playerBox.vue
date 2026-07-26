<script>

</script>

<template>
    <div class="player-box">
        <div class="box-top"></div>
        <div class="box-content">
            <slot></slot>
        </div>
        <div class="box-bottom"></div>
    </div>
</template>

<style lang="less" scoped>
.player-box{

}

.box-top{
    height: 21px;
    background: url("/static/box-top.gif") no-repeat;
}
.box-bottom{
    height: 21px;
    background: url("/static/box-bottom.gif") no-repeat;
}
.box-content{
    background: url("/static/box-bg.gif") repeat-y;
    padding: 0 17px;
}
</style>