<script setup>
import LongButton from '@/components1/longButton.vue';

// 16×7 = 112 格背包
const COLS = 16
const ROWS = 7
const cells = Array.from({ length: COLS * ROWS })
</script>

<template>
    <div class="dqdl-backpack">
        <div class="backpack-cells">
            <div class="backpack-cell" v-for="(cell, idx) in cells" :key="idx"></div>
        </div>
        <div class="backpack-page-actions">
            <div class="backpack-page">
                <div class="backpack-page-left"></div>
                <div class="backpack-page-textarea">
                    <div class="textarea-left"></div>
                    <div class="textarea-body">
                        1/10
                    </div>
                    <div class="textarea-right"></div>
                </div>
                <div class="backpack-page-right"></div>
            </div>
            <div class="backpack-actions">
                <LongButton>背包整理</LongButton>
            </div>
        </div>
    </div>
</template>

<style lang="less" scoped>
.dqdl-backpack{
    width: 100%;
    padding: 10px 0;
    .backpack-cells{
        display: grid;
        grid-template-columns: repeat(16, 1fr);   /* 16 列 */
        gap: 2px;
        .backpack-cell{
            width: 56px;
            height: 56px;
            background: url("/static/item-cell-bg.gif");
            background-size: 100% 100%;
        }
    }
    .backpack-page-actions{
        display: flex;
        justify-content: space-between;
        align-items: center;
        .backpack-page{
            display: flex;
            align-items: center;
            gap: 3px;
            margin-top: 10px;
            .backpack-page-left{
                background: url("/static/arrow-left.gif");
                width: 15px;
                height: 16px;
            }
            .backpack-page-right{
                background: url("/static/arrow-right.gif");
                width: 15px;
                height: 16px;
            }
            .backpack-page-textarea{
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
                    padding: 0 5px 0 5px;
                    height: 22px;
                    background: transparent url("/static/textarea-bg.gif") repeat-x;
                }
            }
        }
        .backpack-actions{

        }
    }
}
</style>
