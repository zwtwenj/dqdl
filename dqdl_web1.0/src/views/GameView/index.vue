<script setup>
import Navigation from './navigation.vue'
import PlayerInfo from './playerInfo.vue'
import Footer from './footer.vue'
import ModuleBox from '@/components1/moduleBox.vue'
import MapView from './mapView.vue'
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
