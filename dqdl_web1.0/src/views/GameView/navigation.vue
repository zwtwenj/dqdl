<script setup>
/**
 * 顶部导航栏：游戏标题 + 当前时间 + 退出游戏。
 * 退出需二次确认，确认后返回登录页选择角色（不清理 token，保持登录态）。
 */
import { ref, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { confirm } from '@/components1/confirm'

const router = useRouter()

// —— 当前时间（每秒刷新 HH:MM:SS）——
const now = ref('')
let timer = null
function pad(n) {
    return String(n).padStart(2, '0')
}
function tick() {
    const d = new Date()
    now.value = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
onMounted(() => {
    tick()
    timer = setInterval(tick, 1000)
})
onUnmounted(() => {
    if (timer) clearInterval(timer)
})

// —— 退出游戏（二次确认 → 返回登录页，不清理 token）——
async function onExit() {
    const ok = await confirm({ title: '退出游戏', content: '确定退出当前游戏，返回角色选择吗？' })
    if (!ok) return
    router.push('/')
}
</script>

<template>
    <div class="game-view-navigation">
        <div class="navigation-left">斗气大陆</div>
        <div class="navigation-right">
            <!--显示当前时间-->
            <div class="navigation-time">{{ now }}</div>
            <div class="navigation-exit" @click="onExit">退出</div>
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
    .navigation-right{
        display: flex;
        gap: 10px;
    }
    .navigation-time{
        color: var(--text-light);
        font-size: var(--fs-sm);
    }
    .navigation-exit{
        color: var(--text-light);
        font-size: var(--fs-sm);
        cursor: pointer;
    }
    .navigation-exit:hover{
        color: var(--link);
    }
}
</style>
