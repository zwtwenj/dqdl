<script setup>
/**
 * 通用翻页组件：左/右翻页箭头 + 中间页码显示区。
 * 接受当前页与总页数，向外抛出 prev / next 两个事件。
 */
defineProps({
  /** 当前页（从 1 开始） */
  current: {
    type: Number,
    default: 1,
  },
  /** 总页数 */
  total: {
    type: Number,
    default: 1,
  },
})

const emit = defineEmits(['prev', 'next'])
</script>

<template>
  <div class="dqdl-pager">
    <div class="pager-left" @click="emit('prev')"
      @dragover.prevent="$emit('prev-dragover')" @dragleave="$emit('prev-dragleave')" @drop.prevent="$emit('prev-drop')"></div>
    <div class="pager-textarea">
      <div class="textarea-left"></div>
      <div class="textarea-body">{{ current }} / {{ total }}</div>
      <div class="textarea-right"></div>
    </div>
    <div class="pager-right" @click="emit('next')"
      @dragover.prevent="$emit('next-dragover')" @dragleave="$emit('next-dragleave')" @drop.prevent="$emit('next-drop')"></div>
  </div>
</template>

<style lang="less" scoped>
.dqdl-pager{
    display: flex;
    align-items: center;
    gap: 3px;
    .pager-left, .pager-right{
        cursor: pointer;
        width: 15px;
        height: 16px;
    }
    .pager-left{ background: url("/static/arrow-left.gif"); }
    .pager-right{ background: url("/static/arrow-right.gif"); }
    .pager-textarea{
        display: flex;
        .textarea-left{
            float: left;
            width: 3px;
            height: 22px;
            background: url("/static/textarea-left.gif") no-repeat;
        }
        .textarea-right{
            float: right;
            width: 3px;
            height: 22px;
            background: url("/static/textarea-right.gif") no-repeat;
        }
        .textarea-body{
            float: left;
            line-height: 22px;
            text-align: center;
            color: #e9e5dc;
            padding: 0 5px;
            height: 22px;
            background: transparent url("/static/textarea-bg.gif") repeat-x;
        }
    }
}
</style>
