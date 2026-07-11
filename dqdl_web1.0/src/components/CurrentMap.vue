<script setup>
/**
 * 当前地图组件：返回上级 + 类型图标/地名/危险度/斗气 + 描述 + 常见魔兽/药草。
 * 改为 props 驱动：接收 location 对象（后端 findOne 返回）。
 * common_mobs/common_herbs 是 JSON 字符串，这里 parse 后渲染。
 * 图标路径按 mob_id/item_id 直接拼，onerror 回退到 WB-001/yb-001。
 */
import { ref, computed } from 'vue'
import FloatingTooltip from './FloatingTooltip.vue'

const props = defineProps({
  location: { type: Object, default: null },
  npcs: { type: Array, default: () => [] },
})

const emit = defineEmits(['back', 'npc-select'])

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

/* ============ 魔兽/药草 tooltip（共享一个 FloatingTooltip 实例） ============
   hover 某图标时记录该图标 DOM 元素 + 名称，单一浮层显示名称。 */
const hoveredEl = ref(null)
const hoveredName = ref('')
const tipOpen = ref(false)
function onDropEnter(e, name) {
  hoveredEl.value = e.currentTarget
  hoveredName.value = name
  tipOpen.value = true
}
function onDropLeave() {
  tipOpen.value = false
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
            @pointerenter="onDropEnter($event, m.name)"
            @pointerleave="onDropLeave"
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
            @pointerenter="onDropEnter($event, h.name)"
            @pointerleave="onDropLeave"
          >
            <img
              :src="h.icon"
              :alt="h.name"
              @error="onHerbError"
            >
          </div>
        </div>
      </div>
      <!--此地之人：NPC 卡片，点击触发对话（npc-select 事件）-->
      <div
        v-if="npcs.length"
        class="npcs-row"
      >
        <span class="drops-label">此地之人</span>
        <div class="npcs-list">
          <div
            v-for="npc in npcs"
            :key="npc.id"
            class="npc-card"
            @pointerenter="onDropEnter($event, `${npc.name}·${npc.role_name}`)"
            @pointerleave="onDropLeave"
            @click="emit('npc-select', npc)"
          >
            <span class="npc-card-icon">🧙</span>
            <span class="npc-card-body">
              <span class="npc-card-name">{{ npc.name }}</span>
              <span class="npc-card-role">{{ npc.role_name }} · {{ npc.nature_name }}</span>
            </span>
            <span class="npc-card-gender">{{ npc.gender }}·{{ npc.age }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 魔兽/药草 tooltip：共享一个浮层，Teleport 到 body -->
    <FloatingTooltip
      v-model:open="tipOpen"
      :reference="hoveredEl"
      placement="top"
    >
      <div class="drop-tip-name">
        {{ hoveredName }}
      </div>
    </FloatingTooltip>
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
    color: #1d1604;
    width: 86%;
    height: 52%;
    overflow: hidden;
    letter-spacing: 1px;
    text-shadow: 0 1px 0px rgba(0, 0, 0, 0.9);
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
      flex-shrink:  0;
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
  /* 「此地之人」NPC 卡片行：独占一整行（与上方魔兽/药草横向区隔开） */
  .npcs-row{
    width: 100%;
    margin-top: 8px;
    padding-top: 10px;
    border-top: 1px solid rgba(180, 150, 90, 0.18);
    display: flex;
    align-items: flex-start;
    gap: 10px;
    .drops-label{
      font-size: 13px;
      color: #c8a868;
      letter-spacing: 2px;
      flex-shrink: 0;
      line-height: 34px;
    }
    .npcs-list{
      flex: 1;
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
    }
    .npc-card{
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 5px 12px 5px 6px;
      background: rgba(30, 24, 16, 0.6);
      border: 1px solid rgba(150, 120, 70, 0.35);
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s ease;
      font-family: 'STKaiti', 'KaiTi', '楷体', serif;
      .npc-card-icon{
        font-size: 1.3rem;
        line-height: 1;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.6));
      }
      .npc-card-body{
        display: flex;
        flex-direction: column;
        gap: 1px;
        .npc-card-name{
          font-size: 14px;
          color: #e8d5a0;
          letter-spacing: 1px;
          line-height: 1.2;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
        }
        .npc-card-role{
          font-size: 11px;
          color: rgba(200, 170, 110, 0.7);
          line-height: 1.2;
        }
      }
      .npc-card-gender{
        font-size: 11px;
        color: rgba(180, 160, 130, 0.55);
        letter-spacing: 1px;
        align-self: center;
      }
      &:hover{
        border-color: rgba(220, 190, 120, 0.8);
        background: rgba(45, 36, 22, 0.8);
        box-shadow: 0 0 12px rgba(212, 175, 106, 0.18);
        transform: translateY(-1px);
      }
    }
  }
}

/* 魔兽/药草 tooltip 名称（浮层外壳由 FloatingTooltip 提供，Teleport 到 body） */
.drop-tip-name{
  font-size: 13px;
  color: #e8d5a0;
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}
</style>
