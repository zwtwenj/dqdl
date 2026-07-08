<script setup>
/**
 * 当前地图组件：返回上级 + 类型图标/地名/危险度/斗气 + 描述 + 常见魔兽/药草。
 * 返回按钮暂只做 UI，未接回退逻辑。
 */
import { ref } from 'vue'

/* 假数据：沿用后端 location 结构（name/loc_type/description/danger_level/qi_density/tags） */
const location = ref({
  name: '加玛圣城',
  loc_type: 'city',
  description: '加玛帝国都城，繁华富庶，强者云集之地。',
  danger_level: 0,
  qi_density: 12,
  tags: ['繁华', '帝国都城'],
})

/* 常见魔兽 / 药草（仅野外类有，此处给假图标占位） */
const mobs = [
  { icon: '/icon/mob/mob-7.png', name: '紫晶翼狮' },
  { icon: '/icon/mob/mob-23.png', name: '六阶魔兽' },
  { icon: '/icon/mob/mob-41.png', name: '云芝仙草' },
]
const herbs = [
  { icon: '/icon/alchemy/alchemy-3.png', name: '紫叶兰' },
  { icon: '/icon/alchemy/alchemy-15.png', name: '洗髓花' },
  { icon: '/icon/alchemy/alchemy-30.png', name: '冰灵丹草' },
]
</script>

<template>
  <div class="current-map">
    <div class="current-map-back">
      <img
        class="current-map-back-bg"
        src="/ui/back.png"
      >
      <span class="current-map-back-text">返回上级地图</span>
    </div>
    <div class="current-map-top">
      <div class="current-map-top-left">
        <div class="location-type-name">
          <img
            class="location-type"
            src="/icon/location/city.png"
          >
          <span class="location-name">加玛圣城</span>
        </div>
        
        <div class="location-danger-power">
          <!--危险度：仅 danger_level > 0 时显示-->
          <div
            class="danger-box"
          >
            <img
              class="danger-icon"
              src="/icon/location/danger.png"
            >
            <span class="danger-val">高危</span>
          </div>
          <!--斗气浓郁度：仅 qi_density > 0 时显示-->
          <div
            v-if="location.qi_density > 0"
            class="power-box"
          >
            <img
              class="power-icon"
              src="/icon/location/power.png"
            >
            <span class="power-val">{{ location.qi_density }}</span>
          </div>
        </div>
      </div>
      <div class="location-description">
        <img
          class="location-description-bg"
          src="/icon/location/map_description.png"
        >
        <div class="location-description-text">
          {{ location.description }}
        </div>
      </div>
    </div>
    <div class="current-map-bottom">
      <!--常见魔兽-->
      <div class="drops-row">
        <span class="drops-label">常见魔兽</span>
        <div class="drops-icons">
          <div
            v-for="m in mobs"
            :key="m.name"
            class="drop-item"
            :title="m.name"
          >
            <img
              :src="m.icon"
              :alt="m.name"
            >
          </div>
        </div>
      </div>
      <!--常见药草-->
      <div class="drops-row">
        <span class="drops-label">常见药草</span>
        <div class="drops-icons">
          <div
            v-for="h in herbs"
            :key="h.name"
            class="drop-item"
            :title="h.name"
          >
            <img
              :src="h.icon"
              :alt="h.name"
            >
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="less" scoped>
.current-map{
  position: relative;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 14px;
  max-width: 860px;
  padding: 20px 24px 18px;
  // 暗金面板：深褐半透 + 金边 + 模糊
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.82), rgba(14, 11, 8, 0.86));
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(220, 190, 120, 0.12);
  backdrop-filter: blur(6px);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
.current-map-back{
  position: relative;
  cursor: pointer;
  width: 150px;
  height: 32px;
  .current-map-back-bg{
    width: 100%;
    height: 100%;
    object-fit: fill;
    transition: filter 0.2s ease;
  }
  .current-map-back-text{
    position: absolute;
    top: 7px;
    left: 40px;
    font-size: 12px;
    color: #f0d890;
    letter-spacing: 2px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    pointer-events: none;
  }
  &:hover .current-map-back-bg{
    filter: brightness(1.25);
  }
}

.current-map-top{
  display: flex;
  gap: 16px;
  align-items: center;
  .current-map-top-left{
    width: 220px;
    flex-shrink: 0;
  }
}
.location-type-name{
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 10px;
  .location-type{
    width: 30px;
    height: 30px;
    object-fit: contain;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.7));
  }
  .location-name{
    font-size: 18px;
    color: #f0d890;
    letter-spacing: 3px;
    text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
  }
}

.location-description{
  position: relative;
  flex: 1;
  overflow: hidden;
  max-width: 600px;
  .location-description-bg{
    width: 100%;
    object-fit: fill;
  }
  .location-description-text{
    position: absolute;
    top: 25%;
    left: 7%;
    font-size: 13px;
    line-height: 1.6;
    color: #e8d5a0;
    width: 86%;
    height: 52%;
    overflow: hidden;
    letter-spacing: 1px;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  }
}

/* ===== 以下为本次补充的新增元素样式，未改动上方已有规则 ===== */

.location-danger-power{
  display: flex;
  align-items: center;
  gap: 10px;
  .danger-box{
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    .danger-icon{
      width: 24px;
      height: 24px;
      object-fit: contain;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
    }
    .danger-val{
      font-size: 13px;
      color: #ff9080;
      letter-spacing: 2px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    }
  }
  .power-box{
    display: flex;
    align-items: center;
    gap: 4px;
    .power-icon{
      width: 24px;
      height: 24px;
      object-fit: contain;
      filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.7));
    }
    .power-val{
      font-size: 13px;
      color: #80c8ff;
      letter-spacing: 1px;
      text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
    }
  }
}

.current-map-bottom{
  display: flex;
  gap: 28px;
  padding: 10px 4px 2px;
  border-top: 1px solid rgba(180, 150, 90, 0.18);
  .drops-row{
    display: flex;
    align-items: center;
    gap: 10px;
    .drops-label{
      font-size: 13px;
      color: #c8a868;
      letter-spacing: 2px;
      flex-shrink: 0;
    }
    .drops-icons{
      display: flex;
      gap: 8px;
      .drop-item{
        width: 40px;
        height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(10, 8, 6, 0.5);
        border: 1px solid rgba(180, 150, 90, 0.3);
        border-radius: 4px;
        transition: all 0.2s ease;
        img{
          width: 32px;
          height: 32px;
          object-fit: contain;
        }
        &:hover{
          border-color: rgba(220, 190, 120, 0.7);
          background: rgba(40, 30, 18, 0.6);
        }
      }
    }
  }
}
</style>
