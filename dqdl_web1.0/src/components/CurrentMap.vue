<script setup>
/**
 * 当前地图组件：返回上级 + 类型图标/地名/危险度/斗气 + 描述 + 常见魔兽/药草。
 * 改为 props 驱动：接收 location 对象（后端 findOne 返回）。
 * common_mobs/common_herbs 是 JSON 字符串，这里 parse 后渲染。
 * 图标路径按 mob_id/item_id 直接拼，onerror 回退到 WB-001/yb-001。
 */
import { computed } from 'vue'

const props = defineProps({
  location: { type: Object, default: null },
})

const emit = defineEmits(['back'])

/* loc_type → 图标映射 */
const typeIconMap = {
  continent: '/icon/location/city.png',
  region: '/icon/location/city.png',
  empire: '/icon/location/city.png',
  city: '/icon/location/city.png',
  district: '/icon/location/city.png',
  market: '/icon/location/city.png',
  cultivation: '/icon/location/cultivation.png',
  forging: '/icon/location/forging.png',
  wild: '/icon/location/wild.png',
  wild2: '/icon/location/wild.png',
  wild3: '/icon/location/wild.png',
  sect: '/icon/location/sect.png',
  secret: '/icon/location/secret.png',
  alchemy: '/icon/location/city.png',
}

/** 危险等级 → 中文 */
function dangerText(level) {
  return ['', '低危', '中危', '高危', '极危', '禁地'][level] || ''
}

/** 解析 common_mobs JSON 字符串 → 数组 */
const mobs = computed(() => {
  if (!props.location?.common_mobs) return []
  try {
    const arr = JSON.parse(props.location.common_mobs)
    return (Array.isArray(arr) ? arr : []).map((m) => ({
      ...m,
      icon: `/icon/mob/${m.mob_id}.png`,
    }))
  } catch {
    return []
  }
})

/** 解析 common_herbs JSON 字符串 → 数组 */
const herbs = computed(() => {
  if (!props.location?.common_herbs) return []
  try {
    const arr = JSON.parse(props.location.common_herbs)
    return (Array.isArray(arr) ? arr : []).map((h) => ({
      ...h,
      icon: `/icon/alchemy/${h.item_id}.png`,
    }))
  } catch {
    return []
  }
})

/** 类型图标 */
const typeIcon = computed(
  () => typeIconMap[props.location?.loc_type] || '/icon/location/city.png',
)

/** 图片加载失败时回退图标 */
function onMobError(e) {
  e.target.src = '/icon/mob/WB-001.png'
}
function onHerbError(e) {
  e.target.src = '/icon/alchemy/yb-001.png'
}
</script>

<template>
  <div class="current-map">
    <div
      class="current-map-back"
      @click="emit('back')"
    >
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
            :src="typeIcon"
          >
          <span class="location-name">{{ location?.name }}</span>
        </div>

        <div class="location-danger-power">
          <!--危险度：仅 danger_level > 0 时显示-->
          <div
            v-if="location?.danger_level > 0"
            class="danger-box"
          >
            <img
              class="danger-icon"
              src="/icon/location/danger.png"
            >
            <span class="danger-val">{{ dangerText(location.danger_level) }}</span>
          </div>
          <!--斗气浓郁度：仅 qi_density > 0 时显示-->
          <div
            v-if="location?.qi_density > 0"
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
          {{ location?.description }}
        </div>
      </div>
    </div>
    <div class="current-map-bottom">
      <!--常见魔兽-->
      <div
        v-if="mobs.length"
        class="drops-row"
      >
        <span class="drops-label">常见魔兽</span>
        <div class="drops-icons">
          <div
            v-for="m in mobs"
            :key="m.mob_id"
            class="drop-item"
            :title="m.name"
          >
            <img
              :src="m.icon"
              :alt="m.name"
              @error="onMobError"
            >
          </div>
        </div>
      </div>
      <!--常见药草-->
      <div
        v-if="herbs.length"
        class="drops-row"
      >
        <span class="drops-label">常见药草</span>
        <div class="drops-icons">
          <div
            v-for="h in herbs"
            :key="h.item_id"
            class="drop-item"
            :title="h.name"
          >
            <img
              :src="h.icon"
              :alt="h.name"
              @error="onHerbError"
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
  max-width: 860px;
  padding: 20px 24px 18px;
  // 暗金面板：深褐半透 + 金边
  background: linear-gradient(160deg, rgba(28, 22, 16, 0.82), rgba(14, 11, 8, 0.86));
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 10px;
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.6), inset 0 1px 0 rgba(220, 190, 120, 0.12);
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
  .current-map-top-left{
    padding-top: 20px;
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
