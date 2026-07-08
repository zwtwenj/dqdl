<script setup>
/**
 * 通用地图抽屉组件：标题栏（可展开/收起）+ 横向卡片列表。
 * 邻近之地（同级）与可达之所（子级）复用此组件，仅标题与数据不同。
 *
 * Props:
 *   title    抽屉标题（如"邻近之地"/"可达之所"）
 *   items    地点卡片数组 [{ id, name, loc_type, danger_level, qi_density }]
 *   currentId 当前选中地点 id（高亮）
 *   defaultExpanded 默认是否展开
 *
 * Emits:
 *   select   点击卡片时触发，参数为该地点对象
 */
import { ref, watch } from 'vue'

const props = defineProps({
  title: { type: String, default: '地图' },
  items: { type: Array, default: () => [] },
  currentId: { type: Number, default: null },
  defaultExpanded: { type: Boolean, default: true },
})

const emit = defineEmits(['select'])

const expanded = ref(props.defaultExpanded)

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

/** 点击卡片 */
function onSelect(item) {
  emit('select', item)
}

/* defaultExpanded 变化时同步（父组件切换场景时重置展开态） */
watch(() => props.defaultExpanded, (v) => {
  expanded.value = v
})
</script>

<template>
  <div
    class="map-drawer"
    :class="{ collapsed: !expanded }"
  >
    <!-- 标题栏：占一整行，箭头在右 -->
    <div
      class="drawer-header"
      @click="expanded = !expanded"
    >
      <span class="header-title">{{ title }}</span>
      <span class="header-arrow">{{ expanded ? '▲' : '▼' }}</span>
    </div>

    <!-- 卡片区：横向排列，全部显示 -->
    <transition name="drawer-slide">
      <div
        v-show="expanded"
        class="drawer-body"
      >
        <div
          v-for="item in items"
          :key="item.id"
          class="map-card"
          :class="{ active: item.id === currentId }"
          @click="onSelect(item)"
        >
          <!-- 上方：危险度 + 斗气浓郁度 -->
          <div class="card-top">
            <div
              v-if="item.danger_level > 0"
              class="card-danger"
            >
              <img
                class="danger-icon"
                src="/icon/location/danger.png"
              >
              <span class="danger-val">{{ dangerText(item.danger_level) }}</span>
            </div>
            <div
              v-if="item.qi_density > 0"
              class="card-power"
            >
              <img
                class="power-icon"
                src="/icon/location/power.png"
              >
              <span class="power-val">{{ item.qi_density }}</span>
            </div>
            <div
              v-if="item.danger_level === 0 && item.qi_density === 0"
              class="card-safe"
            >
              安宁
            </div>
          </div>

          <!-- 中间：地图类型图标 -->
          <div class="card-icon">
            <img
              :src="typeIconMap[item.loc_type] || '/icon/location/city.png'"
              :alt="item.loc_type"
            >
          </div>

          <!-- 下方：地图名 -->
          <div class="card-name">
            {{ item.name }}
          </div>
        </div>

        <!-- 空状态 -->
        <div
          v-if="items.length === 0"
          class="empty-tip"
        >
          暂无地点
        </div>
      </div>
    </transition>
  </div>
</template>

<style lang="less" scoped>
.map-drawer {
  z-index: 8;
  display: flex;
  flex-direction: column;
  background: linear-gradient(180deg, rgba(28, 22, 16, 0.88), rgba(14, 11, 8, 0.92));
  border: 1px solid rgba(180, 150, 90, 0.4);
  border-radius: 8px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(220, 190, 120, 0.1);
  overflow: hidden;
  transition: all 0.3s ease;

  &.collapsed {
    .drawer-body {
      display: none;
    }
  }
}

/* 标题栏：横向占一整行，箭头在右 */
.drawer-header {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  cursor: pointer;
  border-bottom: 1px solid rgba(180, 150, 90, 0.3);
  background: linear-gradient(180deg, rgba(40, 30, 18, 0.6), rgba(20, 16, 10, 0.4));
  user-select: none;
  flex-shrink: 0;

  &:hover {
    background: linear-gradient(180deg, rgba(50, 38, 22, 0.7), rgba(25, 20, 12, 0.5));
  }

  .header-title {
    font-size: 14px;
    color: #f0d890;
    letter-spacing: 4px;
    font-family: 'STKaiti', 'KaiTi', '楷体', serif;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.9);
  }

  .header-arrow {
    font-size: 12px;
    color: rgba(200, 168, 104, 0.7);
  }
}

/* 卡片区：横向排列，全部显示，不滚动 */
.drawer-body {
  display: flex;
  flex-direction: row;
  gap: 8px;
  padding: 8px;
  align-items: stretch;
}

/* 地图卡片 */
.map-card {
  flex-shrink: 0;
  width: 110px;
  height: 130px;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 6px 4px;
  background: linear-gradient(180deg, rgba(36, 28, 18, 0.7), rgba(20, 16, 10, 0.8));
  border: 1px solid rgba(180, 150, 90, 0.2);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba(200, 170, 100, 0.5);
    background: linear-gradient(180deg, rgba(46, 36, 22, 0.8), rgba(26, 20, 12, 0.9));
    transform: translateY(-2px);
  }

  &.active {
    border-color: rgba(220, 190, 120, 0.8);
    box-shadow: 0 0 10px rgba(200, 170, 100, 0.35);
    background: linear-gradient(180deg, rgba(50, 40, 24, 0.85), rgba(30, 24, 14, 0.9));
  }
}

/* 卡片顶部：危险度 + 斗气 */
.card-top {
  width: 100%;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  .card-danger {
    display: flex;
    align-items: center;
    gap: 2px;

    .danger-icon {
      width: 16px;
      height: 16px;
      object-fit: contain;
    }

    .danger-val {
      font-size: 10px;
      color: #ff9080;
      letter-spacing: 1px;
      text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
    }
  }

  .card-power {
    display: flex;
    align-items: center;
    gap: 2px;

    .power-icon {
      width: 14px;
      height: 14px;
      object-fit: contain;
    }

    .power-val {
      font-size: 10px;
      color: #80c8ff;
      text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
    }
  }

  .card-safe {
    font-size: 10px;
    color: rgba(200, 180, 140, 0.5);
    letter-spacing: 1px;
  }
}

/* 卡片中间：图标 */
.card-icon {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;

  img {
    width: 48px;
    height: 48px;
    object-fit: contain;
    filter: drop-shadow(0 1px 3px rgba(0, 0, 0, 0.7));
  }
}

/* 卡片底部：地图名 */
.card-name {
  width: 100%;
  text-align: center;
  font-size: 12px;
  color: #e8d5a0;
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 空状态 */
.empty-tip {
  padding: 20px 30px;
  text-align: center;
  font-size: 12px;
  color: rgba(200, 180, 140, 0.4);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  white-space: nowrap;
}

/* 抽屉展开/收起动画 */
.drawer-slide-enter-active,
.drawer-slide-leave-active {
  transition: all 0.3s ease;
  overflow: hidden;
}

.drawer-slide-enter-from,
.drawer-slide-leave-to {
  opacity: 0;
  max-width: 0;
  padding: 0;
}
</style>
