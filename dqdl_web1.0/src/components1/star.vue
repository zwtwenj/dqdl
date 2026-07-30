<script setup>
import { defineProps } from 'vue';

const props = defineProps({
    star: {
        type: Number,
        default: 0
    }
})
</script>

<template>
    <div class="dqdl-star">
        <img src="/static/star.gif" v-for="item in star">
    </div>
</template>

<style lang="less" scoped>
.dqdl-star{
    display: flex;
    align-items: center;
}
</style>