<script setup>
/**
 * 玩家信息组件（左上角）：头像 + 角色名 + 等级 + 生命条 + 斗气条。
 * head.png 是圆形头像框，groove.png 是血条/斗气条底框（两端尖角，中间镂空）。
 * 填充条放在 groove 底框的镂空区域内，按百分比显示宽度。
 *
 * Props:
 *   name      角色名
 *   level     等级（数字）
 *   levelName 等级中文名（如"斗之气1段"，优先显示）
 *   hp/maxHp       生命值
 *   energy/maxEnergy 斗气值
 */
defineProps({
  name: { type: String, default: '无名' },
  level: { type: Number, default: 1 },
  levelName: { type: String, default: '' },
  hp: { type: Number, default: 100 },
  maxHp: { type: Number, default: 100 },
  energy: { type: Number, default: 50 },
  maxEnergy: { type: Number, default: 100 },
})
</script>

<template>
  <div class="player-panel">
    <!-- 头像：avatar 在底层，frame（金边圆环）盖在上面，金边外的部分用圆形裁剪隐藏 -->
    <div class="avatar-box">
      <img
        class="player-avatar"
        src="/player/avatar.png"
        alt=""
      >
      <img
        class="avatar-frame"
        src="/player/head.png"
        alt=""
      >
    </div>

    <!-- 信息 + 血条 -->
    <div class="info-box">
      <div class="name-row">
        <span class="name">{{ name }}</span>
        <span class="level">{{ levelName || ('Lv.' + level) }}</span>
      </div>

      <!-- 生命条 -->
      <div class="bar-row">
        <div class="bar-wrap">
          <img
            class="bar-groove"
            src="/player/groove.png"
            alt=""
          >
          <!-- bar-inner 表示 groove 镂空区，fill 在其内部按百分比填充 -->
          <div class="bar-inner">
            <div
              class="bar-fill hp-fill"
              :style="{ width: Math.min(100, (hp / Math.max(1, maxHp)) * 100) + '%' }"
            />
          </div>
          <span class="bar-text">{{ hp }}/{{ maxHp }}</span>
        </div>
      </div>

      <!-- 斗气条 -->
      <div class="bar-row">
        <div class="bar-wrap">
          <img
            class="bar-groove"
            src="/player/groove.png"
            alt=""
          >
          <div class="bar-inner">
            <div
              class="bar-fill energy-fill"
              :style="{ width: Math.min(100, (energy / Math.max(1, maxEnergy)) * 100) + '%' }"
            />
          </div>
          <span class="bar-text">{{ energy }}/{{ maxEnergy }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.player-panel {
  position: absolute;
  width: 250px;
  top: 5px;
  left: 5px;
  z-index: 10;
  display: flex;
  align-items: center;
  padding: 8px 16px 8px 8px;
  /* background: rgba(10, 8, 6, 0.55); */
  /* border: 1px solid rgba(180, 150, 90, 0.25); */
  /* border-radius: 6px; */
  /* backdrop-filter: blur(4px); */
}

/* 头像 */
.avatar-box {
  position: relative;
  width: 70px;
  height: 70px;
  flex-shrink: 0;
}

/* 圆环外框：置于最上层，金边盖住 avatar 的溢出边缘 */
.avatar-frame {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  z-index: 2;
  pointer-events: none;
}

/* 头像本体：底层；用圆形裁剪，直径比金边内圈略小，确保不溢出金边 */
.player-avatar {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 80%;
  height: 74%;
  object-fit: cover;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  z-index: 2;
}

/* 信息区 */
.info-box {
  position: absolute;
  display: flex;
  flex-direction: column;
  left: 60px;
  gap: 3px;
  min-width: 180px;
}

.name-row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-left: 20px;
}

.name {
  font-size: 15px;
  color: #e8d5a0;
  letter-spacing: 1px;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
}

.level {
  font-size: 12px;
  color: #8ab870;
  letter-spacing: 1px;
}

/* 血条行 */
.bar-row {
  display: flex;
  align-items: center;
  gap: 4px;
  height: 16px;
}

.bar-label {
  width: 14px;
  font-size: 11px;
  color: rgba(200, 180, 140, 0.6);
  text-align: center;
  flex-shrink: 0;
}

/* groove 底框 + 填充条 */
.bar-wrap {
  position: relative;
  flex: 1;
  height: 16px;
  display: flex;
  align-items: center;
}

.bar-groove {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
  z-index: 0;
}

/* groove 镂空区：内缩避开两端尖角与上下边框（groove 原图 200×27，
   镂空约 x=5..193、y=4..22），fill 在内部按百分比填充，满血时正好填满镂空区 */
.bar-inner {
  position: absolute;
  left: 4%;
  right: 4%;
  top: 26%;
  bottom: 26%;
  z-index: 1;
  overflow: hidden;
}

/* 填充条：在 bar-inner 内从左侧按百分比生长 */
.bar-fill {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  height: 100%;
  width: 0;
  border-radius: 2px;
  transition: width 0.3s ease;
}

.hp-fill {
  background: linear-gradient(180deg, #e85040, #c0302a);
  box-shadow: inset 0 1px 0 rgba(255, 150, 130, 0.4);
}

.energy-fill {
  background: linear-gradient(180deg, #4ab8e8, #2a88c0);
  box-shadow: inset 0 1px 0 rgba(130, 200, 255, 0.4);
}

.bar-text {
  position: relative;
  z-index: 2;
  width: 100%;
  text-align: center;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 1px 1px rgba(0, 0, 0, 0.9);
  pointer-events: none;
}
</style>
