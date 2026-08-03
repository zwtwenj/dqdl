<script setup>
/**
 * 进度条组件（gif 风格，与 playerInfo 的气血/修为/斗气一致）。
 *
 * 用法：
 *   <ProgressBar type="hp" :pct="60" />       // 气血
 *   <ProgressBar type="energy" :pct="50" />    // 斗气
 *   <ProgressBar type="cult" :pct="30" />      // 修为
 *
 * Props:
 *   type - 'cult' | 'hp' | 'energy'（决定 label + 填充图）
 *   pct  - 进度百分比 0-100
 *   tip  - 可选 tooltip 文案（v-tooltip 跟随鼠标）
 *
 * 填充图：cult=point-bar-1.gif / hp=point-bar-2.gif / energy=point-bar-3.gif
 * 槽：point-bar-bg.gif（固定宽填充 + overflow 截断，绝不被压缩）
 */
import { computed } from 'vue'

const props = defineProps({
    type: {
        type: String,
        default: 'hp',
    },
    pct: {
        type: Number,
        default: 0,
    },
    tip: {
        type: String,
        default: '',
    },
})

const TYPE_CONF = {
    cult: '/static/point-bar-1.gif',
    hp: '/static/point-bar-2.gif',
    energy: '/static/point-bar-3.gif',
}

const fill = computed(() => TYPE_CONF[props.type] || TYPE_CONF.hp)
</script>

<template>
    <div
        class="progress-point-bg"
        v-tooltip="tip"
    >
        <div
            class="progress-point"
            :style="{ width: pct + '%', backgroundImage: `url('${fill}')` }"
        ></div>
    </div>
</template>

<style lang="less" scoped>
.progress-point-bg{
    width: 100%;
    background: url("/static/point-bar-bg.gif") no-repeat;
    background-size: 100% 100%;
    height: 14px;
    padding: 3px;
    overflow: hidden;
    .progress-point{
        height: 100%;
        background-repeat: no-repeat;
        background-size: 137px 100%;   /* 固定宽度=满条宽，高度填满，绝不被压缩 */
        background-position: left center;
        transition: width 0.3s;
    }
}
</style>
