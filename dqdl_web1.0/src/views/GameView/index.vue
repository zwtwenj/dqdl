<script setup>
import Navigation from './navigation.vue'
import PlayerInfo from './playerInfo.vue'
import Footer from './footer.vue'
import ModuleBox from '@/components1/moduleBox.vue'
import MapView from './mapView.vue'
import Dlg from '@/components1/dlg.vue'
import Button from '@/components1/button.vue'
import { useScriptStream } from '@/composables/useScriptStream'
import { usePlayerStore } from '@/stores/player'
import { bus, BusEvents } from '@/utils/eventBus'
import { ref, onMounted, onUnmounted } from 'vue'
import Information from './information.vue'
import MainContainer from './mainContainer.vue'

const playerStore = usePlayerStore()

// 进入游戏页建立通用 SSE 长连接（剧本触发/移动到达等推送），离开时关闭
const { open: openStream, close: closeStream } = useScriptStream()

// 移动事件（SSE 推送）→ 刷新玩家状态（位置/status 变化，状态栏同步）：
//  走完一段/全程结束/取消，玩家数据都可能变，统一刷新
let offMoveArrived = null
let offMoveFinished = null
let offMoveCancelled = null
onMounted(() => {
  openStream()
  offMoveArrived = bus.on(BusEvents.PLAYER_MOVE_ARRIVED, () => playerStore.load())
  offMoveFinished = bus.on(BusEvents.PLAYER_MOVE_FINISHED, () => playerStore.load())
  offMoveCancelled = bus.on(BusEvents.PLAYER_MOVE_CANCELLED, () => playerStore.load())
})
onUnmounted(() => {
  closeStream()
  offMoveArrived?.()
  offMoveFinished?.()
  offMoveCancelled?.()
})

const mainContainerShow = ref(false)
const mainContainerTab = ref('player')

const openContainer = (tab) => {
  mainContainerTab.value = tab
  mainContainerShow.value = true
}
</script>

<template>
  <div class="game-view">
    <!--顶部导航栏-->
    <Navigation />

    <div class="game-view-content">
        <div class="game-view-left">
            <PlayerInfo @openContainer="openContainer"></PlayerInfo>
        </div>
        <ModuleBox class="game-view-right">
            <MapView></MapView>
            <Information></Information>
            <MainContainer 
            v-if="mainContainerShow"
            :defaultTab="mainContainerTab"
            @close="mainContainerShow=false">
            </MainContainer>
        </ModuleBox>
    </div>

    <!--底部功能栏-->
    <Footer></Footer>
  </div>
</template>

<style lang="less" scoped>
.game-view {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
  background: url('/static/bg-large.gif');
  display: flex;
  flex-direction: column;
  .game-view-content{
    flex: 1;
    padding: 10px;
    overflow: auto;
    display: flex;
    gap: 12px;
    margin: auto;
    .game-view-right{
        width: 1000px;
        position: relative;
        align-self: flex-start;   /* 高度由内容撑开，不被 flex 拉伸到容器满高 */
    }
  }
}
</style>
