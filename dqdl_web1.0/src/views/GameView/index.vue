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

const show = ref(false)
const playerStore = usePlayerStore()

// 进入游戏页建立通用 SSE 长连接（剧本触发/移动到达等推送），离开时关闭
const { open: openStream, close: closeStream } = useScriptStream()

// 移动到达（SSE 推送）→ 刷新玩家状态（status 从 MOVING 恢复 IDLE，状态栏同步）
let offMoveArrived = null
onMounted(() => {
  openStream()
  offMoveArrived = bus.on(BusEvents.PLAYER_MOVE_ARRIVED, () => {
    playerStore.load()
  })
})
onUnmounted(() => {
  closeStream()
  offMoveArrived?.()
})
</script>

<template>
  <div class="game-view">
    <!--顶部导航栏-->
    <Navigation />

    <div class="game-view-content">
        <div class="game-view-left">
            <PlayerInfo></PlayerInfo>
        </div>
        <ModuleBox class="game-view-right">
            <MapView></MapView>
        </ModuleBox>
    </div>

    <!--底部功能栏-->
    <Footer></Footer>

    <Dlg v-if="show" @close="show=false">
        <div>
          <div class="dlg-content">
            弹窗21333333333333333333333adsa
            13123dqwquuuuuuuuuuuuuuuuuh
          </div>
          <div class="dlg-actions" style="margin-top: 10px;">
            <Button>确定</Button>
          </div>
        </div>
    </Dlg>
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
    }
  }
}
</style>
