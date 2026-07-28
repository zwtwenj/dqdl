<script setup>
import { ref } from 'vue';

const tabs = ref([
    { name: '当前任务', value: 'task' },
    { name: '历练日志', value: '1' },
    { name: '采集日志', value: '2' },
    { name: 'tab', value: '3' }
])

const focusTab = ref('task')
</script>

<template>
    <div class="dqdl-information">
        <div class="information-tabs">
            <div class="information-tab" :class="{ 'tab-is-active': focusTab === tab.value }" v-for="tab in tabs">{{ tab.name }}</div>
        </div>
        <div class="information-content">
            任务信息
        </div>
    </div>
</template>

<style lang="less" scoped>
.dqdl-information{
    margin-top: 10px;
    display: flex;
    border: 1px solid #c3b8b1;
    height: 140px;
    .information-tabs{
        width: 110px;
        padding: 10px 0;
        .information-tab{
            height: 30px;
            line-height: 30px;
            text-align: center;
            font-weight: bold;
            font-size: 14px;
            cursor: pointer;
        }
        .tab-is-active{
            background: url("/static/field-switch-button.gif") no-repeat;
            color: var(--danger);
        }
    }
    .information-content{
        background-color: #f5f2ea;
        flex: 1;
        padding: 10px;
        overflow-y: auto;
    }
}
</style>