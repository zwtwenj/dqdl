<script setup>
import Dlg from '@/components1/dlg.vue';
</script>

<template>
    <Dlg title="任务" :contentStyleProp="{ width: '558px', height: '500px' }">
        <div class="dqdl-task-dlg">
            任务
        </div>
    </Dlg>
</template>

<style lang="less" scoped>
.dqdl-task-dlg{
    background: #efede9;
    height: 100%;
    overflow-y: auto;
}
</style>