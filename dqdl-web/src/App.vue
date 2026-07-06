<template>
  <!-- 开始界面 -->
  <div v-if="!gameStarted" class="start-screen">
    <div class="start-overlay"></div>
    <div class="start-content">
      <div class="title-glow">斗气大陆</div>
      <div class="title-divider"></div>
      <p class="subtitle">AI 文字冒险</p>
      <template v-if="!loading">
        <div class="start-buttons">
          <button v-if="hasSave" class="btn btn--success btn--lg btn--block" @click="continueGame">继续游戏</button>
          <button class="btn btn--lg btn--block" :class="hasSave ? 'btn--ghost' : 'btn--primary'" @click="newGame">新游戏</button>
        </div>
      </template>
      <div v-else class="loading-box">
        <div class="spinner"></div>
        <p class="loading-text">{{ loadingText }}</p>
      </div>
    </div>
  </div>

  <!-- 游戏界面 -->
  <div v-else class="game-screen">
    <!-- 顶栏 -->
    <div class="top-bar">
      <span class="player-name">{{ player?.name }}</span>
      <div class="top-bar-right">
        <button class="btn btn--sm btn--success" @click="toggleBackpack">背包</button>
        <button class="btn btn--sm btn--info" @click="showTaskPanel = true">
          任务
          <span v-if="pendingTaskCount > 0" class="badge task-badge">{{ pendingTaskCount }}</span>
        </button>
        <button class="btn btn--sm btn--primary" @click="showRole = true">角色</button>
        <button class="btn btn--sm btn--warning" @click="showSkillPanel = true">斗技</button>
        <button class="btn btn--sm btn--primary" @click="showTreasurePanel = true">宝物</button>
        <button class="btn btn--sm btn--success" @click="showAlchemyPanel = true">炼丹</button>
        <button class="btn btn--sm btn--info" @click="encounterStore.open">
          奇遇
          <span v-if="encounterStore.list.length" class="badge task-badge">{{ encounterStore.list.length }}</span>
        </button>
      </div>
    </div>

    <!-- 角色面板（独立组件） -->
    <RolePanel v-if="showRole" :overlay-z="zRole" @close="showRole = false" />

    <!-- 地图导航（面包屑） -->
    <div class="breadcrumb">
      <span class="crumb-compass">🧭</span>
      <template v-for="(node, idx) in breadcrumb" :key="node.id">
        <span class="sep" v-if="idx > 0">❯</span>
        <span
          v-if="idx < breadcrumb.length - 1"
          class="crumb-link"
          :class="{ disabled: trainingMode }"
          @click="!trainingMode && moveTo(node, idx)"
        >{{ node.name }}</span>
        <span v-else class="crumb-current">{{ node.name }}</span>
      </template>
    </div>

    <!-- 当前地点信息 -->
    <div class="location-info" :class="typeClass(currentLocation.loc_type)" v-if="currentLocation">
      <!-- 标题簇：图标 + 地名 + 类型（紧凑 inline，不再浮右） -->
      <div class="loc-header">
        <span class="loc-glyph">{{ typeIcon(currentLocation.loc_type) }}</span>
        <h2 class="loc-name">{{ currentLocation.name }}</h2>
        <span class="loc-type-badge">{{ typeLabel(currentLocation.loc_type) }}</span>
      </div>

      <!-- 属性条：危险 / 斗气 / 魔兽种数 单行排布 -->
      <div
        class="loc-stats"
        v-if="currentLocation.danger_level > 0 || currentLocation.qi_density > 0 || parseMobs(currentLocation.common_mobs).length || parseMobs(currentLocation.gather_herbs).length"
      >
        <span class="stat stat--danger" v-if="currentLocation.danger_level > 0">
          <i>⚔</i>危险 {{ dangerLabel(currentLocation.danger_level) }}
        </span>
        <span class="stat stat--qi" v-if="currentLocation.qi_density > 0">
          <i>✦</i>斗气 {{ currentLocation.qi_density }}
        </span>
        <span class="stat stat--mob" v-if="parseMobs(currentLocation.common_mobs).length">
          <i>🐺</i>{{ parseMobs(currentLocation.common_mobs).length }} 种魔兽
        </span>
        <span class="stat stat--herb" v-if="parseMobs(currentLocation.gather_herbs).length">
          <i>🌿</i>{{ parseMobs(currentLocation.gather_herbs).length }} 种药草
        </span>
      </div>

      <p class="loc-desc" v-if="currentLocation.description">{{ currentLocation.description }}</p>

      <!-- 魔兽名条 -->
      <div class="loc-mobs" v-if="parseMobs(currentLocation.common_mobs).length">
        <span class="mob-tag" v-for="mob in parseMobs(currentLocation.common_mobs)" :key="mob.mob_id">
          <span class="mob-name">{{ mob.name }}</span>
          <span class="mob-rank" v-if="mob.rank">{{ mob.rank }}</span>
        </span>
      </div>

      <!-- 常见药草名条 -->
      <div class="loc-mobs" v-if="parseMobs(currentLocation.gather_herbs).length">
        <span class="mob-tag herb-tag" v-for="herb in parseMobs(currentLocation.gather_herbs)" :key="herb.item_id">
          <span class="mob-name">🌿 {{ herb.name }}</span>
        </span>
      </div>
    </div>

    <!-- 加载遮罩 -->
    <div class="loading-overlay" v-if="loading">
      <div class="spinner"></div>
      <p>{{ loadingText }}</p>
    </div>

    <!-- 地图区域：兄弟节点 + 子节点 -->
    <div class="map-area" v-if="!loading">
      <!-- 兄弟节点（同级可跳转） -->
      <div class="section" v-if="breadcrumb.length >= 2">
        <div class="section-title">邻近之地</div>
        <div class="loc-grid">
          <div
            v-for="sib in currentSiblings"
            :key="sib.id"
            class="loc-card"
            :class="[typeClass(sib.loc_type), { active: sib.id === currentLocation?.id, 'card-locked': trainingMode }]"
            @click="!trainingMode && moveTo(sib, breadcrumb.length - 1)"
          >
            <div class="loc-card__icon">{{ typeIcon(sib.loc_type) }}</div>
            <div class="loc-card__body">
              <span class="card-name">{{ sib.name }}</span>
              <span class="card-type">{{ typeLabel(sib.loc_type) }}</span>
            </div>
            <div class="loc-card__tags">
              <span class="tag tag--danger" v-if="sib.danger_level > 0">⚔ {{ dangerShort(sib.danger_level) }}</span>
              <span class="tag tag--qi" v-if="sib.qi_density > 0">✦ {{ sib.qi_density }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 子节点（向下探索） -->
      <div class="section" v-if="currentChildren.length > 0">
        <div class="section-title">可达之所</div>
        <div class="loc-grid">
          <div
            v-for="child in currentChildren"
            :key="child.id"
            class="loc-card"
            :class="[typeClass(child.loc_type), { 'card-locked': trainingMode }]"
            @click="!trainingMode && moveTo(child, breadcrumb.length)"
          >
            <div class="loc-card__icon">{{ typeIcon(child.loc_type) }}</div>
            <div class="loc-card__body">
              <span class="card-name">{{ child.name }}</span>
              <span class="card-type">{{ typeLabel(child.loc_type) }}</span>
            </div>
            <div class="loc-card__tags">
              <span class="tag tag--danger" v-if="child.danger_level > 0">⚔ {{ dangerShort(child.danger_level) }}</span>
              <span class="tag tag--qi" v-if="child.qi_density > 0">✦ {{ child.qi_density }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- 空提示 -->
      <div class="section" v-if="currentChildren.length === 0 && currentSiblings.length <= 1">
        <p class="empty-hint">此地已无更深之处，前路尽头的风云等你去掀开。</p>
      </div>

      <!-- NPC 列表 -->
      <div class="section" v-if="currentNpcs.length > 0">
        <div class="section-title">此地之人</div>
        <div class="loc-grid">
          <div
            v-for="npc in currentNpcs"
            :key="npc.id"
            class="loc-card npc-card"
            @click="openDialog(npc)"
          >
            <div class="loc-card__icon">🧙</div>
            <div class="loc-card__body">
              <span class="card-name">{{ npc.name }}</span>
              <span class="card-type">{{ npc.role_name }} · {{ npc.nature_name }}</span>
            </div>
            <span class="card-gender">{{ npc.gender }} · {{ npc.age }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 对话弹窗 -->
    <div class="dialog-overlay" v-if="dialogNpc">
      <div class="dialog-box">
        <div class="dialog-header">
          <span class="dialog-npc-name">{{ dialogNpc.name }}</span>
          <span class="dialog-npc-info">{{ dialogNpc.gender }} · {{ dialogNpc.age }} · {{ dialogNpc.role_name }} · {{ dialogNpc.nature_name }}</span>
          <button class="dialog-close" @click="closeDialog">X</button>
        </div>
        <div class="dialog-messages" ref="dialogMessages">
          <div class="msg-system">你走向了{{ dialogNpc.name }}...</div>
          <div v-for="(msg, idx) in dialogHistory" :key="idx" class="msg-pair">
            <div v-if="msg.player" class="msg-player">{{ msg.player }}</div>
            <div class="msg-npc">
              {{ msg.npc }}
              <!-- 任务卡片 -->
              <div v-if="msg.taskCard" class="task-card">
                <div class="task-card-title">⚔️ {{ msg.taskCard.name || '战斗任务' }} <span class="task-card-star">{{ '\u2605'.repeat(msg.taskCard.star || 1) }}</span></div>
                <div class="task-card-body">
                  <span class="task-label">前往：</span>
                  <template v-for="(loc, li) in msg.taskCard.location_path" :key="loc.id">
                    <span v-if="li > 0" class="task-arrow"> &gt; </span>
                    <span
                      class="task-loc-link"
                      @click="navigateToTask(msg.taskCard.location_path); closeDialog()"
                    >{{ loc.name }}</span>
                  </template>
                </div>
                <div class="task-card-body">
                  <span class="task-label">目标：</span>
                  击杀 <span class="task-mob">{{ msg.taskCard.mob_name }}</span>
                    <span class="task-kill">{{ msg.taskCard.kill_count }}只</span>
                </div>
                <div class="task-card-body" v-if="msg.taskCard.reward && msg.taskCard.reward.length">
                  <span class="task-label">奖励：</span>
                  <span v-for="(rw, ri) in msg.taskCard.reward" :key="ri" class="task-reward-tag">
                    <template v-if="rw.type === 'money'">💰 {{ rw.value }} 金币</template>
                    <template v-else>{{ rw.name }} &times;{{ rw.count }}</template>
                  </span>
                </div>
                <div class="task-card-progress">
                  进度：{{ msg.taskCard.current }} / {{ msg.taskCard.required }}
                </div>
                <!-- 接受按鈕区域 -->
                <div class="task-card-actions" v-if="msg.taskCard.preview && !msg.taskCard.accepted">
                  <button
                    class="btn btn--sm btn--success"
                    :disabled="taskLoading"
                    @click="acceptCurrentTask(msg.taskCard)"
                  >接受任务</button>
                </div>
                <div class="task-accepted-tip" v-else-if="msg.taskCard.accepted">
                  ✔ 已接受，前往目标地点完成任务
                </div>
                <div class="task-error-tip" v-if="msg.taskCard.error">
                  ⚠️ {{ msg.taskCard.error }}
                </div>
              </div>
            </div>
          </div>
          <div v-if="dialogLoading || taskLoading" class="msg-loading">思考中...</div>
        </div>
        <!-- 快捷对话选项 -->
        <div class="dialog-events" v-if="dialogNpc?.dialog_events?.length">
          <div
            v-for="evt in dialogNpc.dialog_events"
            :key="evt.id"
            class="event-btn"
            @click="handleEventClick(evt)"
          >
            {{ evt.text }}
          </div>
        </div>
        <div class="dialog-input">
          <input
            v-model="dialogInput"
            placeholder="说点什么..."
            @keyup.enter="handleSend"
            :disabled="dialogLoading"
          />
          <button class="btn btn--sm btn--primary" @click="handleSend" :disabled="dialogLoading || !dialogInput.trim()">发送</button>
        </div>
      </div>
    </div>

    <!-- 任务面板（独立组件） -->
    <TaskPanel v-if="showTaskPanel" :overlay-z="zTaskPanel" @close="showTaskPanel = false" />

    <!-- 背包弹窗 -->
    <div class="role-overlay" v-if="showBackpack" :style="{ zIndex: zBackpack }" @click="showBackpack = false">
      <div class="role-panel backpack-panel" @click.stop>
        <div class="role-header">
          <span class="role-title">背包</span>
          <button class="role-close" @click="showBackpack = false">&times;</button>
        </div>
        <!-- 金币 -->
        <div class="backpack-money">
          <span class="money-icon">💰</span>
          <span class="money-value">{{ player?.money ?? 0 }}</span>
          <span class="money-unit">金币</span>
        </div>
        <div class="backpack-body">
          <div v-if="backpackItems.length === 0" class="backpack-empty">行囊空空如也</div>
          <div class="bp-grid" v-else>
            <div
              v-for="(item, idx) in backpackItems"
              :key="idx"
              class="bp-slot"
              :class="{ 'is-usable': item.usable }"
              @mouseenter="showItemTip(item, $event)"
              @mouseleave="hideItemTip"
              @contextmenu.prevent="item.usable && !usingItem && usePlayerItem(item.name)"
            >
              <div class="bp-slot__icon">
                <img v-if="isImgIcon(item.icon)" :src="item.icon" :alt="item.name" class="bp-slot__img">
                <template v-else>{{ itemIcon(item) }}</template>
              </div>
              <div class="bp-slot__name">{{ item.name }}</div>
              <span v-if="item.count > 1" class="bp-slot__count">{{ item.count }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 交易弹窗 -->
    <div class="role-overlay" v-if="showTrade" :style="{ zIndex: zTrade }">
      <div class="role-panel trade-panel">
        <div class="role-header">
          <span class="role-title">交易</span>
          <button class="role-close" @click="closeTrade">&times;</button>
        </div>
        <div class="trade-body">
          <!-- NPC 出售（商店） -->
          <div class="trade-side trade-npc">
            <div class="trade-side-title">
              🏪 NPC 出售
              <span class="trade-money">💰 {{ player?.money ?? 0 }} 金币</span>
            </div>
            <div v-if="shopItems.length === 0" class="trade-empty">暂无物品出售</div>
            <div class="bp-grid" v-else>
              <div
                v-for="(item, idx) in shopItems"
                :key="'s' + idx"
                class="bp-slot trade-slot"
                @mouseenter="showItemTip(item, $event, 'buy')"
                @mouseleave="hideItemTip"
              >
                <div class="bp-slot__icon">
                <img v-if="isImgIcon(item.icon)" :src="item.icon" :alt="item.name" class="bp-slot__img">
                <template v-else>{{ itemIcon(item) }}</template>
              </div>
                <div class="bp-slot__name">{{ item.name }}</div>
                <button
                  class="trade-slot-btn trade-slot-btn--buy"
                  :disabled="tradeBuying || (player?.money ?? 0) < item.price"
                  :title="'购买（Shift×10）'"
                  @click.stop="buyShopItem(item.id, $event.shiftKey ? 10 : 1)"
                >{{ item.price }}金 购买</button>
              </div>
            </div>
          </div>
          <!-- 我的背包（与背包弹窗保持一致） -->
          <div class="trade-side trade-player">
            <div class="trade-side-title">
              🎒 我的背包
              <span class="trade-money">💰 {{ player?.money ?? 0 }} 金币</span>
            </div>
            <div v-if="backpackItems.length === 0" class="trade-empty">背包空空如也</div>
            <div class="bp-grid" v-else>
              <div
                v-for="(item, idx) in backpackItems"
                :key="'p' + idx"
                class="bp-slot trade-slot"
                @mouseenter="showItemTip(item, $event)"
                @mouseleave="hideItemTip"
              >
                <div class="bp-slot__icon">
                <img v-if="isImgIcon(item.icon)" :src="item.icon" :alt="item.name" class="bp-slot__img">
                <template v-else>{{ itemIcon(item) }}</template>
              </div>
                <div class="bp-slot__name">{{ item.name }}</div>
                <span v-if="item.count > 1" class="bp-slot__count">{{ item.count }}</span>
                <button
                  class="trade-slot-btn trade-slot-btn--sell"
                  :disabled="tradeSelling"
                  :title="item.price ? ('出售 ' + Math.floor(item.price * 0.5) + ' 金（Shift全部）') : '出售'"
                  @click.stop="sellPlayerItem(item.name, $event.shiftKey ? item.count : 1)"
                >售 {{ Math.floor(item.price * 0.5) }}金</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- 斗技面板（独立组件） -->
    <SkillPanel v-if="showSkillPanel" :overlay-z="zSkillPanel" @close="showSkillPanel = false" />

    <!-- 宝物面板 -->
    <TreasurePanel v-if="showTreasurePanel" :overlay-z="zTreasurePanel" @close="showTreasurePanel = false" />

    <!-- 炼丹面板 -->
    <AlchemyPanel v-if="showAlchemyPanel" :overlay-z="zAlchemyPanel" @close="showAlchemyPanel = false" />

    <!-- 浮动历练卡片（野外常显：未历练可开始，历练中可停止） -->
    <div v-if="isWild" class="training-float">
      <div class="training-float-header" @click="logCollapsed = !logCollapsed">
        <span class="training-float-title">⚔ 历练</span>
        <button v-if="!trainingMode" class="training-float-stop start" @click.stop="startAutoTraining">开始历练</button>
        <button v-else class="training-float-stop" @click.stop="stopAutoTraining">停止历练</button>
        <span class="training-float-toggle">{{ logCollapsed ? '▸' : '▾' }}</span>
      </div>
      <div v-if="!logCollapsed" class="training-float-body">
        <div class="training-float-empty" v-if="!trainingEvents.length">
          <div v-if="trainingMode" class="spinner-sm"></div>
          <span>{{ trainingMode ? '探寻魔兽中...' : '点击「开始历练」探寻魔兽踪迹' }}</span>
        </div>
        <div
          v-for="(evt, idx) in trainingEvents"
          :key="idx"
          class="float-log-entry"
          :class="{ 'float-log-lost': evt.won === false }"
        >
          <p class="float-log-text">{{ evt.text }}</p>
          <div class="float-log-drops" v-if="evt.drops && evt.drops.length">
            🎁 <span class="float-drop-item" v-for="(d, di) in evt.drops" :key="di">{{ d.name }}&times;{{ d.count }}<template v-if="di < evt.drops.length - 1">，</template></span>
          </div>
          <div class="float-log-task" v-if="evt.task_updates && evt.task_updates.length">
            <span
              v-for="(upd, ui) in evt.task_updates"
              :key="ui"
              class="float-task-upd"
              :class="{ 'upd-done': upd.done }"
            >
              📋 {{ upd.description.slice(0, 14) }}… {{ upd.current }}/{{ upd.required }}
              <span v-if="upd.done"> ✔</span>
            </span>
          </div>
          <div class="float-log-encounter" v-if="evt.encounter">
            ✨ 发现奇遇 · {{ evt.encounter.title }}<span class="float-enc-scene">（{{ evt.encounter.scene_type }}）</span>
          </div>
          <span class="float-log-meta" v-if="evt.battle">
            {{ evt.timestamp }}&nbsp;·&nbsp;{{ evt.mob?.name }}&nbsp;·&nbsp;{{ evt.won === false ? '逃跑' : evt.battle?.style }}&nbsp;·&nbsp;胜率{{ evt.battle?.win_rate }}%
          </span>
        </div>
      </div>
    </div>

    <!-- 浮动采集卡片（野外常显：可开始/停止采集草药） -->
    <div v-if="isWild" class="training-float gather-float">
      <div class="training-float-header" @click="gatherCollapsed = !gatherCollapsed">
        <span class="training-float-title">🌿 采集</span>
        <button v-if="!gatherMode" class="training-float-stop start" @click.stop="startAutoGather">开始采集</button>
        <button v-else class="training-float-stop" @click.stop="stopAutoGather">停止采集</button>
        <span class="training-float-toggle">{{ gatherCollapsed ? '▸' : '▾' }}</span>
      </div>
      <div v-if="!gatherCollapsed" class="training-float-body">
        <div class="training-float-empty" v-if="!gatherEvents.length">
          <div v-if="gatherMode" class="spinner-sm"></div>
          <span>{{ gatherMode ? '采集中...' : '点击「开始采集」搜寻草药' }}</span>
        </div>
        <div
          v-for="(evt, idx) in gatherEvents"
          :key="idx"
          class="float-log-entry"
        >
          <p class="float-log-text">{{ evt.text }}</p>
          <div class="float-log-drops" v-if="evt.drops && evt.drops.length">
            🎁 <span class="float-drop-item" v-for="(d, di) in evt.drops" :key="di">{{ d.name }}&times;{{ d.count }}<template v-if="di < evt.drops.length - 1">，</template></span>
          </div>
        </div>
      </div>
    </div>

    <!-- 室内修炼悬浮卡片：修炼室会话进行中且主面板已收起时常驻右下角 -->
    <div v-if="cultivationRoomStore.isActive && !cultivationRoomStore.showPanel" class="cult-room-float">
      <div class="cult-room-float-head">
        <span class="cult-room-float-title">🧘 修炼中</span>
        <span class="cult-room-float-mode">{{ cultRoomModeLabel }}</span>
      </div>
      <div class="cult-room-float-bar">
        <div class="cult-room-float-fill" :style="{ width: cultRoomPct + '%' }"></div>
      </div>
      <div class="cult-room-float-foot">
        <button class="cult-room-float-btn expand" @click="cultivationRoomStore.open()">展开</button>
        <button class="cult-room-float-btn stop" @click="cultivationRoomStore.stop()">停止</button>
      </div>
    </div>

    <!-- 战斗界面 -->
    <div class="battle-overlay" v-if="showBattle" :style="{ zIndex: battleStore.overlayZ }">
      <div class="battle-box">
        <button class="battle-close" @click="closeBattle">&times;</button>
        <div class="battle-field" v-if="!battleLoading">
          <!-- 玩家舞台：立绘作背景，状态悬浮其上 -->
          <div class="fighter fighter--player" :class="{ hurt: battlePlayerHurt }">
            <img src="/image/hero-char.webp" class="fighter-bg" alt="角色" />
            <div class="fighter-shade"></div>
            <div class="fighter-hud">
              <div class="stat-line">
                <div class="bar-cap">
                  <span class="stat-ico ico-hp">❤</span>
                  <span class="bar-num">{{ battlePlayerHp }}/{{ playerMaxHp }}</span>
                </div>
                <div class="bar"><i class="fill-hp" :style="{ width: pct(battlePlayerHp, playerMaxHp) + '%' }"></i></div>
              </div>
              <div class="stat-line">
                <div class="bar-cap">
                  <span class="stat-ico ico-energy">✦</span>
                  <span class="bar-num">{{ battlePlayerEnergy }}/{{ playerMaxEnergy }}</span>
                </div>
                <div class="bar"><i class="fill-energy" :style="{ width: pct(battlePlayerEnergy, playerMaxEnergy) + '%' }"></i></div>
              </div>
              <div class="buff-row">
                <span v-for="b in battlePlayerBuffs" :key="b.name + b.stacks" class="buff"
                  @mouseenter="showBuffTip(b, $event)" @mouseleave="hideBuffTip">
                  {{ b.icon }}<em v-if="b.stacks > 1">×{{ b.stacks }}</em>
                </span>
              </div>
            </div>
            <div class="floaters">
              <span v-for="f in battlePlayerFloaters" :key="f.id" class="floater" :class="f.kind" :style="{ left: (50 + (f.dx || 0)) + '%' }">{{ f.text }}</span>
            </div>
            <div class="fighter-name">{{ battlePlayerName }} · {{ levelName(battlePlayerLevel) }}</div>
          </div>

          <div class="battle-vs">⚔</div>

          <!-- 怪物舞台 -->
          <div class="fighter fighter--mob" :class="{ hurt: battleMobHurt }">
            <div class="fighter-bg fighter-bg--mob">🐲</div>
            <div class="fighter-shade"></div>
            <div class="fighter-hud">
              <div class="stat-line">
                <div class="bar-cap">
                  <span class="stat-ico ico-hp">❤</span>
                  <span class="bar-num">{{ battleMobHp }}/{{ mobMaxHp }}</span>
                </div>
                <div class="bar"><i class="fill-hp" :style="{ width: pct(battleMobHp, mobMaxHp) + '%' }"></i></div>
              </div>
              <!-- 怪物无斗气槽：等高占位，使双方 buff 栏垂直对齐 -->
              <div class="stat-line stat-line--ghost" aria-hidden="true">
                <div class="bar-cap"><span class="stat-ico">✦</span></div>
                <div class="bar"></div>
              </div>
              <div class="buff-row">
                <span v-for="b in battleMobBuffs" :key="b.name + b.stacks" class="buff"
                  @mouseenter="showBuffTip(b, $event)" @mouseleave="hideBuffTip">
                  {{ b.icon }}<em v-if="b.stacks > 1">×{{ b.stacks }}</em>
                </span>
              </div>
            </div>
            <div class="floaters">
              <span v-for="f in battleMobFloaters" :key="f.id" class="floater" :class="f.kind" :style="{ left: (50 + (f.dx || 0)) + '%' }">{{ f.text }}</span>
            </div>
            <div class="fighter-name">{{ battleMobName }} · {{ battleMobRank }} Lv.{{ battleMobLevel }}</div>
          </div>
        </div>

        <div class="battle-actions">
          <button class="btn btn--danger" :disabled="battleOver || attacking" @click="battleAttack">攻击</button>
          <div class="battle-skill-slots">
            <div
              v-for="(sk, idx) in equippedSkills"
              :key="sk.id"
              class="battle-skill-slot filled"
              :class="{ 'skill-disabled': battleOver || attacking || (battlePlayerEnergy || 0) < sk.energyCost }"
              @click="battleSkill(idx)"
            >
              <span class="bss-name">{{ sk.name }}</span>
              <span class="bss-cost">斗气{{ sk.energyCost }}</span>
            </div>
            <div v-for="slot in 5 - equippedSkills.length" class="battle-skill-slot" :key="'empty' + slot">
              <span class="bss-empty">空槽</span>
            </div>
          </div>
          <button class="btn btn--ghost" :disabled="attacking" @click="battleFlee">逃跑</button>
        </div>
        <div class="battle-loading" v-if="battleLoading">加载中...</div>

        <!-- 战斗结果横幅 -->
        <div v-if="battleOver" class="battle-result" :class="battleWinner === 'player' ? 'is-win' : 'is-lose'">
          <div class="battle-result-text">{{ battleWinner === 'player' ? '胜 利' : '挑 战 失 败' }}</div>
        </div>
      </div>
    </div>

    <!-- 副本界面（独立组件） -->
    <DungeonPanel v-if="showDungeon" />

    <!-- 奇遇界面（独立组件） -->
    <EncounterPanel v-if="encounterStore.show" />

    <!-- 洞天福地修炼界面（独立组件） -->
    <CultivationPanel v-if="cultivationStore.show" />

    <!-- 城内修炼室（占位） -->
    <CultivationRoomPanel />

    <!-- 功法突破小游戏 -->
    <TechniqueBreakthroughGame v-if="tbStore.show" />

    <!-- 随机事件对话（内部 v-if="current"） -->
    <RandomEventDialog />

    <!-- buff 悬浮组件（fixed + Teleport，脱离战斗框 overflow:hidden） -->
    <Teleport to="body">
      <div v-if="buffTooltip" class="buff-tooltip" :style="buffTooltip.pos">
        <span class="bt-name">{{ buffTooltip.b.name }}</span><span class="bt-stack" v-if="buffTooltip.b.stacks > 1"> ×{{ buffTooltip.b.stacks }}</span><span class="bt-sep">：</span>{{ buffTooltip.b.desc }}<span class="bt-dur">（{{ buffTooltip.b.remaining === '∞' ? '永久' : buffTooltip.b.remaining + '回合' }}）</span>
      </div>
    </Teleport>

    <!-- 物品悬浮组件（fixed + Teleport，脱离背包滚动容器裁切） -->
    <Teleport to="body">
      <div v-if="itemTooltip" ref="itemTipEl" class="item-tip" :style="itemTooltip.pos">
        <div class="tooltip-name">{{ itemTooltip.item.name }}</div>
        <div v-if="itemTooltip.item.description" class="tooltip-desc">{{ itemTooltip.item.description }}</div>
        <div v-if="itemTooltip.item.price && itemTooltip.mode !== 'buy'" class="tooltip-price">💰 出售 {{ Math.floor(itemTooltip.item.price * 0.5) }} 金币</div>
        <div v-else-if="itemTooltip.item.price && itemTooltip.mode === 'buy'" class="tooltip-price">💰 购买 {{ itemTooltip.item.price }} 金币</div>
        <div v-if="itemTooltip.item.usable" class="tooltip-hint">右键使用</div>
      </div>
    </Teleport>
  </div>

  <!-- 全局消息提示（ElMessage 风格，基础组件，挂载一次） -->
  <MessageToast />
</template>

<script setup>
import { computed, ref, watch, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import { usePlayerStore } from './stores/player'
import { useMapStore } from './stores/map'
import { useDialogStore } from './stores/dialog'
import { useBackpackStore } from './stores/backpack'
import { useTaskStore } from './stores/task'
import { useGameStore } from './stores/game'
import { useBattleStore } from './stores/battle'
import { useOverlayStore } from './stores/overlay'
import { useDungeonStore } from './stores/dungeon'
import { useEncounterStore } from './stores/encounter'
import { useCultivationStore } from './stores/cultivation'
import { useCultivationRoomStore } from './stores/cultivationRoom'
import { useTechniqueBreakthroughStore } from './stores/techniqueBreakthrough'
import DungeonPanel from './components/DungeonPanel.vue'
import EncounterPanel from './components/EncounterPanel.vue'
import CultivationPanel from './components/CultivationPanel.vue'
import CultivationRoomPanel from './components/CultivationRoomPanel.vue'
import TechniqueBreakthroughGame from './components/TechniqueBreakthroughGame.vue'
import RolePanel from './components/RolePanel.vue'
import TaskPanel from './components/TaskPanel.vue'
import SkillPanel from './components/SkillPanel.vue'
import TreasurePanel from './components/TreasurePanel.vue'
import AlchemyPanel from './components/AlchemyPanel.vue'
import MessageToast from './components/MessageToast.vue'
import RandomEventDialog from './components/RandomEventDialog.vue'
import { attrLabels, baseAttrKeys, levelName } from './game/constants'

const playerStore = usePlayerStore()
const mapStore = useMapStore()
const dialogStore = useDialogStore()
const backpackStore = useBackpackStore()
const taskStore = useTaskStore()
const gameStore = useGameStore()
const battleStore = useBattleStore()
const dungeonStore = useDungeonStore()
const encounterStore = useEncounterStore()
const cultivationStore = useCultivationStore()
const cultivationRoomStore = useCultivationRoomStore()
const tbStore = useTechniqueBreakthroughStore()

const { data: player } = storeToRefs(playerStore)
const { loading: playerLoading, loadingText: playerLoadingText } = storeToRefs(playerStore)
const { breadcrumb, currentLocation, currentChildren, currentNpcs, currentSiblings, loading: mapLoading, loadingText: mapLoadingText } = storeToRefs(mapStore)
const { npc: dialogNpc, history: dialogHistory, loading: dialogLoading } = storeToRefs(dialogStore)
const { items: backpackItems, shopItems, showPanel: showBackpack, showTrade, tradeSelling, tradeBuying, usingItem } = storeToRefs(backpackStore)
const { list: tasks, loading: taskLoading } = storeToRefs(taskStore)
  const { started: gameStarted, trainingLog, cultivationLog, trainingLoading, trainingMode, trainingEvents, gatherMode, gatherEvents, gatherLoading } = storeToRefs(gameStore)
const { showBattle, battleLoading, mob, playerName: battlePlayerName, playerLevel: battlePlayerLevel, playerHp: battlePlayerHp, playerMaxHp, playerEnergy: battlePlayerEnergy, playerMaxEnergy, mobName: battleMobName, mobLevel: battleMobLevel, mobRank: battleMobRank, mobMaxHp, mobHp: battleMobHp, equippedSkills, battleOver, attacking, playerBuffs: battlePlayerBuffs, mobBuffs: battleMobBuffs, playerHurt: battlePlayerHurt, mobHurt: battleMobHurt, playerFloaters: battlePlayerFloaters, mobFloaters: battleMobFloaters, battleWinner } = storeToRefs(battleStore)
const { showDungeon } = storeToRefs(dungeonStore)

// 游戏开始后预加载奇遇列表（让按钮角标显示已有数量）
watch(gameStarted, (v) => { if (v) encounterStore.fetch() })

const loading = computed(() => playerStore.loading || playerLoading.value || mapLoading.value)
const isWild = computed(() => ['wild', 'wild2', 'wild3'].includes(currentLocation.value?.loc_type))

// 室内修炼悬浮卡片
const cultRoomModeLabel = computed(() => {
  const s = cultivationRoomStore.session
  if (!s) return ''
  const mode = s.mode === 'technique' ? '功法' : '斗气'
  const tier = ['一', '二', '三'][(s.tier || 1) - 1] + '阶'
  return `${tier} · ${mode}`
})
const cultRoomPct = computed(() => {
  const p = cultivationRoomStore.progress
  const cur = p?.current ?? 0
  const max = p?.max ?? 0
  return max <= 0 ? 0 : Math.max(0, Math.min(100, (cur / max) * 100))
})
const logCollapsed = ref(false)
const loadingText = computed(() => mapLoadingText.value || playerLoadingText.value)
const hasSave = computed(() => gameStore.hasSave())

function newGame() { gameStore.newGame() }
function continueGame() { gameStore.continueGame() }
function moveTo(loc, idx) {
  if (trainingMode.value || gatherMode.value) return
  mapStore.moveTo(loc, idx); dialogStore.close()
}
function openDialog(npc) { dialogStore.open(npc) }
function closeDialog() { dialogStore.close() }
function sendDialog(msg) { dialogStore.send(msg) }
function handleEventClick(evt) { dialogStore.handleEvent(evt) }
function toggleBackpack() { backpackStore.toggle() }
function closeTrade() { backpackStore.closeTrade() }
function sellPlayerItem(name, count) { backpackStore.sell(name, count) }
function buyShopItem(itemId, count) { backpackStore.buy(itemId, count) }
function usePlayerItem(name) { backpackStore.use(name) }
// 物品图标：icon 字段为空时使用占位符
function itemIcon(item) { return item?.icon || '📦' }
// icon 是否为图片地址（绝对路径 / http(s) / 带图片扩展名）
function isImgIcon(icon) {
  if (!icon) return false
  return icon.startsWith('/') || /^https?:\/\//.test(icon) || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(icon)
}
function acceptCurrentTask(card) { taskStore.acceptCurrentTask(card) }
function navigateToLocation(locId) {
  if (trainingMode.value || gatherMode.value) return
  mapStore.navigateToLocation(locId); dialogStore.close()
}
function navigateToTask(path) { if (path?.length) navigateToLocation(path[path.length - 1].id) }
function doTrainingEvent() { gameStore.doTrainingEvent() }
function startAutoTraining() { gameStore.startAutoTraining() }
function stopAutoTraining() { gameStore.stopAutoTraining() }
function startAutoGather() { gameStore.startAutoGather() }
function stopAutoGather() { gameStore.stopAutoGather() }
function openBattle() { battleStore.open() }
function closeBattle() { battleStore.close() }
function battleAttack() { battleStore.playerAttack() }
function battleSkill(idx) { battleStore.skillAttack(idx) }
function battleFlee() { battleStore.flee() }
function openDungeon() { dungeonStore.enter() }

// 战斗 UI 辅助
function pct(cur, max) { const m = max || 1; return Math.max(0, Math.min(100, (cur / m) * 100)) }

// buff 悬浮组件：定位到所指向的 buff 下方，并夹紧在视口内（脱离战斗框 overflow 裁切）
const buffTooltip = ref(null)
function showBuffTip(b, e) {
  const r = e.currentTarget.getBoundingClientRect()
  const tipW = 210
  let left = r.left + r.width / 2 - tipW / 2
  left = Math.max(8, Math.min(window.innerWidth - tipW - 8, left))
  buffTooltip.value = { b, pos: { left: left + 'px', top: r.bottom + 8 + 'px', width: tipW + 'px' } }
}
function hideBuffTip() { buffTooltip.value = null }

function doCultivate() { gameStore.doCultivate() }

const dialogInput = ref('')
function handleSend() { const msg = dialogInput.value.trim(); if (!msg || dialogLoading.value) return; dialogInput.value = ''; sendDialog(msg) }

const showTaskPanel = ref(false)
const pendingTaskCount = computed(() => tasks.value.filter(t => t.status === 'pending').length)

const showRole = ref(false)

// ── 动态 z-index：App.vue 本地 ref 控制的弹窗，watch 显隐自动 acquire/release ──
const overlay = useOverlayStore()
const zRole = ref(0)
const zTaskPanel = ref(0)
const zBackpack = ref(0)
const zTrade = ref(0)
watch(showRole, v => { zRole.value = v ? overlay.acquire('role') : (overlay.release('role'), 0) })
watch(showTaskPanel, v => { zTaskPanel.value = v ? overlay.acquire('taskPanel') : (overlay.release('taskPanel'), 0) })
watch(() => backpackStore.showPanel, v => { zBackpack.value = v ? overlay.acquire('backpack') : (overlay.release('backpack'), 0) })
watch(() => backpackStore.showTrade, v => { zTrade.value = v ? overlay.acquire('trade') : (overlay.release('trade'), 0) })

// 物品悬浮组件：定位到所指向的格子下方，并夹紧在视口内（脱离背包滚动容器裁切）
const itemTooltip = ref(null)
const itemTipEl = ref(null)
function showItemTip(item, e, mode = 'sell') {
  const r = e.currentTarget.getBoundingClientRect()
  const M = 8
  // 先隐藏渲染，下一帧测量真实尺寸后再定位（measure → flip → shift，避免溢出屏幕）
  itemTooltip.value = { item, mode, pos: { left: '-9999px', top: '-9999px', width: '230px', visibility: 'hidden' } }
  nextTick(() => {
    const el = itemTipEl.value
    const w = el?.offsetWidth || 230
    const h = el?.offsetHeight || 120
    // shift（水平）：以格子中心对齐并夹紧
    let left = r.left + r.width / 2 - w / 2
    left = Math.max(M, Math.min(window.innerWidth - w - M, left))
    // flip（垂直）：优先下方；放不下翻到上方；都放不下则贴底
    let top = r.bottom + M
    if (top + h > window.innerHeight - M) {
      const above = r.top - M - h
      top = above >= M ? above : Math.max(M, window.innerHeight - h - M)
    }
    itemTooltip.value = { item, mode, pos: { left: left + 'px', top: top + 'px', width: w + 'px' } }
  })
}
function hideItemTip() { itemTooltip.value = null }

const showSkillPanel = ref(false)
const showTreasurePanel = ref(false)
const showAlchemyPanel = ref(false)
const zSkillPanel = ref(0)
const zTreasurePanel = ref(0)
const zAlchemyPanel = ref(0)
watch(showSkillPanel, v => { zSkillPanel.value = v ? overlay.acquire('skillPanel') : (overlay.release('skillPanel'), 0) })
watch(showTreasurePanel, v => { zTreasurePanel.value = v ? overlay.acquire('treasurePanel') : (overlay.release('treasurePanel'), 0) })
watch(showAlchemyPanel, v => { zAlchemyPanel.value = v ? overlay.acquire('alchemyPanel') : (overlay.release('alchemyPanel'), 0) })
const gatherCollapsed = ref(false)

function typeLabel(type) { return {continent:'大陆',region:'区域',empire:'帝国',city:'城市',wild:'野外',wild2:'野外深处',wild3:'野外核心',sect:'宗派',secret:'秘境',district:'区域',scene:'场景',cultivation:'修炼室',market:'坊市',forging:'冶炼坊',alchemy:'丹房'}[type]||type }
function dangerLabel(level) { return {1:'一阶(低危)',2:'二阶(中危)',3:'三阶(高危)'}[level]||level }
function dangerShort(level) { return { 1: '一阶', 2: '二阶', 3: '三阶' }[level] || level }
function parseMobs(raw) { try { const a = typeof raw === 'string' ? JSON.parse(raw) : raw; return Array.isArray(a) ? a : [] } catch { return [] } }

// 地点类型 → 图标（玄幻辨识）
function typeIcon(type) {
  return { continent: '🌏', region: '🧭', empire: '🏛', city: '🏯', district: '🏮', scene: '📍', wild: '🌲', wild2: '🌲', wild3: '🌲', sect: '⛩️', secret: '✨', cultivation: '🧘', market: '🏪', forging: '🔨', alchemy: '⚗️' }[type] || '📍'
}
// 地点类型 → 配色族（卡片左边强调色 / 悬停光晕）
function typeClass(type) {
  if (['wild', 'wild2', 'wild3'].includes(type)) return 'is-wild'
  if (['city', 'district', 'market', 'forging', 'alchemy', 'cultivation'].includes(type)) return 'is-city'
  if (type === 'sect') return 'is-sect'
  if (type === 'secret') return 'is-secret'
  if (type === 'empire' || type === 'continent' || type === 'region') return 'is-realm'
  return 'is-place'
}
</script>

<style>
/* ===== 开始界面 ===== */
.start-screen {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  color: #e0d6c2;
  overflow: hidden;
  background: #0a0a0f url('/image/bg-continent.webp') center center / cover no-repeat;
}

/* 暗色遮罩：保证文字在任何背景图上都清晰可读 */
.start-overlay {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background:
    radial-gradient(ellipse at center, rgba(10, 10, 15, 0.30) 0%, rgba(10, 10, 15, 0.80) 70%, rgba(10, 10, 15, 0.95) 100%),
    linear-gradient(to bottom, rgba(10, 10, 15, 0.55), rgba(10, 10, 15, 0.88));
}

.start-content {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0 20px;
  animation: startFadeIn 1s ease both;
}

.title-glow {
  font-size: clamp(2.8rem, 8vw, 5.5rem);
  font-weight: 900;
  letter-spacing: 0.5rem;
  /* 视口过窄时收缩字间距，避免溢出 */
  padding-left: 0.5rem;
  color: #f3c969;
  margin: 0;
  text-shadow:
    0 0 20px rgba(240, 192, 64, 0.6),
    0 0 50px rgba(240, 192, 64, 0.35),
    0 2px 4px rgba(0, 0, 0, 0.85);
  animation: titlePulse 3.2s ease-in-out infinite;
}

.title-divider {
  width: 140px;
  height: 2px;
  margin: 1.3rem 0 0.9rem;
  background: linear-gradient(90deg, transparent, #f0c040, transparent);
  box-shadow: 0 0 12px rgba(240, 192, 64, 0.5);
}

.subtitle {
  font-size: 1.15rem;
  color: #c9b896;
  margin-bottom: 3rem;
  letter-spacing: 0.6rem;
  padding-left: 0.6rem;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.85);
}

.start-buttons {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 280px;
  max-width: 90vw;
}

.loading-box {
  text-align: center;
}

.loading-text {
  color: #c9b896;
  margin-top: 1rem;
  font-size: 1.1rem;
  letter-spacing: 0.15rem;
  text-shadow: 0 1px 6px rgba(0, 0, 0, 0.85);
}

.spinner {
  width: 44px;
  height: 44px;
  border: 3px solid rgba(240, 192, 64, 0.2);
  border-top: 3px solid #f0c040;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 1rem;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes startFadeIn {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes titlePulse {
  0%, 100% { text-shadow: 0 0 20px rgba(240, 192, 64, 0.6), 0 0 50px rgba(240, 192, 64, 0.35), 0 2px 4px rgba(0, 0, 0, 0.85); }
  50% { text-shadow: 0 0 30px rgba(240, 192, 64, 0.85), 0 0 75px rgba(240, 192, 64, 0.5), 0 2px 4px rgba(0, 0, 0, 0.85); }
}

/* ===== 游戏界面 ===== */
.game-screen {
  min-height: 100vh;
  background: #0a0a0f;
  color: #e0d6c2;
  padding: 16px 24px;
  position: relative;
}

.top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid var(--border);
  margin-bottom: 12px;
}

.player-name {
  color: var(--gold);
  font-weight: bold;
  font-size: 1.1rem;
}

.player-stat {
  color: #50c878;
  font-size: 0.9rem;
  font-weight: bold;
}

.player-attr {
  color: #6a6a7a;
  font-size: 0.85rem;
}

/* 面包屑 */
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 0;
  font-size: 0.95rem;
  margin-bottom: 14px;
  color: var(--text-muted);
}

.crumb-compass { font-size: 1.05rem; opacity: 0.85; }

.crumb-link {
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--transition);
}
.crumb-link:hover { color: var(--gold); }
.crumb-link.disabled { opacity: 0.4; cursor: not-allowed; pointer-events: none; }

.crumb-current {
  color: var(--gold);
  font-weight: 700;
  text-shadow: 0 0 12px rgba(240, 192, 64, 0.4);
}

.sep { color: var(--text-dim); margin: 0 2px; font-size: 0.8em; }

/* —— 地点类型配色族（卡片与地点头共用 --accent）—— */
.is-wild { --accent: #e74c3c; }
.is-city { --accent: var(--gold); }
.is-sect { --accent: var(--purple); }
.is-secret { --accent: var(--teal); }
.is-realm { --accent: var(--gold-soft); }
.is-place { --accent: #6a6a8a; }

/* 地点信息（当前所在 · 氛围头） */
.location-info {
  background:
    linear-gradient(180deg, color-mix(in srgb, var(--accent, var(--gold)) 10%, var(--bg-elev-1)), var(--bg-elev-1));
  border: 1px solid var(--border-strong);
  border-left: 3px solid var(--accent, var(--gold));
  border-radius: var(--radius-lg);
  padding: 18px 20px;
  margin-bottom: 18px;
  box-shadow: var(--shadow-panel);
}

.loc-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}

.loc-glyph {
  font-size: 1.9rem;
  line-height: 1;
  filter: drop-shadow(0 0 10px var(--accent, var(--gold)));
}

.loc-name {
  margin: 0;
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--text);
  letter-spacing: 0.04em;
}

.loc-type-badge {
  padding: 3px 12px;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  color: var(--accent, var(--gold));
  background: color-mix(in srgb, var(--accent, var(--gold)) 14%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent, var(--gold)) 40%, transparent);
}

.loc-stats {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 12px;
  padding: 8px 14px;
  background: rgba(0, 0, 0, 0.22);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
.stat {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.82rem;
  white-space: nowrap;
}
.stat i { font-style: normal; font-size: 0.95rem; }
.stat--danger { color: #e8a89c; }
.stat--danger i { color: var(--danger); }
.stat--qi { color: #9fd8c8; }
.stat--qi i { color: var(--teal); }
.stat--mob { color: var(--text-muted); }
.stat--mob i { color: #f0a08c; }

.chip {
  font-size: 0.78rem;
  padding: 3px 10px;
  border-radius: var(--radius-pill);
  border: 1px solid;
}
.chip--danger { color: var(--danger); border-color: rgba(231, 76, 60, 0.4); background: rgba(231, 76, 60, 0.1); }
.chip--qi { color: var(--teal); border-color: rgba(64, 192, 160, 0.4); background: rgba(64, 192, 160, 0.1); }

.loc-desc {
  color: var(--text-muted);
  font-size: 0.95rem;
  line-height: 1.7;
  font-style: italic;
}

.loc-mobs {
  margin-top: 12px;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
}
.mobs-label {
  font-size: 0.78rem;
  color: var(--text-muted);
  letter-spacing: 0.1em;
  margin-right: 2px;
}
.mob-tag {
  display: inline-flex;
  align-items: baseline;
  gap: 4px;
  padding: 2px 10px;
  border-radius: var(--radius-pill);
  font-size: 0.78rem;
  color: #f0a08c;
  background: rgba(231, 76, 60, 0.12);
  border: 1px solid rgba(231, 76, 60, 0.35);
}
.herb-tag {
  color: #8fd88f;
  background: rgba(80, 200, 120, 0.12);
  border-color: rgba(80, 200, 120, 0.35);
}
.stat--herb { color: var(--text-muted); }
.stat--herb i { color: #8fd88f; }
.mob-name { font-weight: 500; }
.mob-rank {
  font-size: 0.68rem;
  color: var(--danger);
  opacity: 0.85;
}

/* 历练区域 */
/* 修炼 */
.cultivate-area {
  margin-top: 10px;
  display: flex;
  align-items: center;
  gap: 12px;
}
.cultivate-bar-wrap { flex: 1; height: 6px; background: #1a1a2e; border-radius: 3px; overflow: hidden; min-width: 80px; }
.cultivate-bar { height: 100%; background: linear-gradient(90deg, #3498db, #2ecc71); border-radius: 3px; transition: width 0.3s; }
.cultivate-log { margin-top: 6px; }
.cultivate-log-entry { font-size: 0.8rem; color: #8a8aaa; padding: 2px 0; }
.cult-critical { color: #f0c040; font-weight: bold; }
.cult-capped { color: #e06060; }
.attr-cultivation { margin-top: 12px; padding-top: 10px; border-top: 1px solid #2a2a3a; }
.attr-cult-row { display: flex; align-items: center; gap: 8px; }
.btn-breakthrough { padding: 3px 12px; border: 1px solid #9b59b6; background: #1a1028; color: #c39bdb; border-radius: 4px; cursor: pointer; font-size: 0.78rem; flex-shrink: 0; }
.btn-breakthrough:hover:not(:disabled) { background: #2a1848; color: #e0b0f0; }
.btn-breakthrough:disabled { opacity: 0.4; cursor: not-allowed; }
.attr-cult-label { font-size: 0.82rem; color: #8a8aaa; margin-bottom: 4px; }
.attr-cult-val { font-size: 0.85rem; color: #c0c0cc; margin-bottom: 6px; }
.attr-cult-bar-wrap { height: 8px; background: #1a1a2e; border-radius: 4px; overflow: hidden; }
.attr-cult-bar { height: 100%; background: linear-gradient(90deg, #9b59b6, #e74c3c); border-radius: 4px; transition: width 0.3s; }
.cultivate-info {
  color: #8a8aaa;
  font-size: 0.82rem;
}

.loc-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}
.training-log {
  margin-top: 8px;
  max-height: 200px;
  overflow-y: auto;
}
.log-entry {
  background: #1e1e2a;
  border-left: 3px solid #e74c3c;
  padding: 8px 10px;
  margin-bottom: 6px;
  border-radius: 0 4px 4px 0;
}
.log-entry.log-lost {
  border-left-color: #555;
  background: #1a1a22;
}
.log-entry.log-lost .log-text {
  color: #777;
}
.log-text {
  color: #d0d0d8;
  font-size: 0.88rem;
  line-height: 1.5;
  margin: 0;
}
.log-meta {
  color: #6a6a7a;
  font-size: 0.75rem;
}

/* 掉落物 */
.log-task-updates {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin: 4px 0;
}
.log-task-upd {
  font-size: 0.75rem;
  background: #1a1a2e;
  border: 1px solid #4a3a60;
  color: #b090e0;
  padding: 2px 7px;
  border-radius: 10px;
}
.log-task-upd.upd-done {
  border-color: #60d060;
  color: #60d060;
  background: #0a1a0a;
}

.log-drops {
  color: #b0a070;
  font-size: 0.82rem;
  margin-top: 4px;
}
.drop-item {
  color: #f0c040;
  font-weight: bold;
}

/* 地图区域 */
.map-area {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.8rem;
  color: var(--text-muted);
  letter-spacing: 0.15em;
  margin-bottom: 12px;
}
.section-title::before {
  content: '';
  width: 22px;
  height: 1px;
  background: linear-gradient(90deg, var(--gold), transparent);
}

.loc-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.loc-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  min-width: 190px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-left: 3px solid var(--accent, var(--border-strong));
  border-radius: var(--radius);
  cursor: pointer;
  transition: transform var(--transition), border-color var(--transition),
    background var(--transition), box-shadow var(--transition);
}

.loc-card:hover {
  transform: translateY(-2px);
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent, var(--gold)) 12%, var(--bg-elev-2));
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
}

.loc-card.active {
  border-color: var(--gold);
  background: color-mix(in srgb, var(--gold) 14%, var(--bg-elev-2));
}

/* 历练锁定态：不可点击、弱化 */
.loc-card.card-locked,
.loc-card.card-locked:hover {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
  transform: none;
  box-shadow: none;
}

.loc-card__icon {
  font-size: 1.5rem;
  line-height: 1;
  filter: drop-shadow(0 0 6px var(--accent, var(--gold)));
}

.loc-card__body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.card-name {
  font-size: 1.02rem;
  color: var(--text);
  font-weight: 600;
}

.card-type {
  font-size: 0.72rem;
  color: var(--text-muted);
  letter-spacing: 0.05em;
}

.loc-card__tags {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
}

.tag {
  font-size: 0.7rem;
  padding: 1px 7px;
  border-radius: var(--radius-pill);
  white-space: nowrap;
}
.tag--danger { color: var(--danger); background: rgba(231, 76, 60, 0.14); }
.tag--qi { color: var(--teal); background: rgba(64, 192, 160, 0.14); }

.card-gender {
  font-size: 0.72rem;
  color: var(--text-muted);
  white-space: nowrap;
}

.empty-hint {
  color: var(--text-dim);
  font-style: italic;
  letter-spacing: 0.04em;
}

/* 角色按钮 */
.top-bar-right {
  display: flex;
  gap: 8px;
  align-items: center;
}

/* 任务按钮角标：外观走 .badge，这里只管定位 */
.task-badge {
  position: absolute;
  top: -5px;
  right: -5px;
  border: 1px solid var(--bg-elev-1);
}

/* 任务面板 */
.task-panel {
  width: 480px;
  max-height: 75vh;
  display: flex;
  flex-direction: column;
}
.task-panel-body {
  overflow-y: auto;
  padding: 12px 16px;
  flex: 1;
}
.task-item {
  background: #13131e;
  border: 1px solid #2a2a3e;
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 10px;
}
.task-item-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}
.task-type-badge {
  font-size: 0.72rem;
  padding: 1px 7px;
  border-radius: 10px;
  font-weight: bold;
}
.type-adventurer { background: #3a2a10; color: #f0a040; border: 1px solid #f0a040; }
.type-common     { background: #1a2a1a; color: #60b060; border: 1px solid #60b060; }
.type-main       { background: #1a1a3a; color: #60a0f0; border: 1px solid #60a0f0; }
.type-side       { background: #2a2a1a; color: #c0c060; border: 1px solid #c0c060; }
.task-status-badge {
  font-size: 0.72rem;
  padding: 1px 7px;
  border-radius: 10px;
  margin-left: auto;
}
.status-pending   { background: #1e2a1e; color: #60d060; border: 1px solid #40a040; }
.status-completed { background: #2a2a10; color: #e0c840; border: 1px solid #c0a030; }
.status-claimed   { background: #2a2a2a; color: #888; border: 1px solid #555; }
.task-star-badge {
  color: #ff8c00;
  font-size: 0.78rem;
  letter-spacing: 1px;
}
.task-item-reward {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 6px;
}
.reward-tag {
  background: #2a2010;
  color: #f0c040;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.78rem;
  border: 1px solid #5a4a20;
}
.task-item-desc {
  font-size: 0.88rem;
  color: #c0c0cc;
  margin-bottom: 8px;
  line-height: 1.5;
}
.task-item-targets {
  margin-bottom: 6px;
}
.task-target-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.82rem;
  padding: 2px 0;
  color: #9090a0;
}
.target-desc { flex: 1; }
.target-progress { margin-left: 8px; }
.progress-done { color: #60d060; font-weight: bold; }
.progress-ing  { color: #e0c840; }
.task-item-nav {
  font-size: 0.8rem;
  color: #60b0f0;
  cursor: pointer;
  text-decoration: underline;
  margin-top: 4px;
}
.task-item-nav:hover { color: #90d0ff; }

/* 交付地点提示 */
.task-item-delivery {
  font-size: 0.8rem;
  color: #60d0a0;
  cursor: pointer;
  margin-top: 6px;
  padding: 4px 8px;
  border-radius: 4px;
  background: #0a1a0a;
  border: 1px solid #40a060;
  text-decoration: underline;
}
.task-item-delivery:hover { color: #90e0c0; border-color: #60c080; }
.task-item-delivery.ready {
  background: #0a1a12;
  border-color: #50c890;
  animation: pulse-green 1.5s ease-in-out infinite;
}
@keyframes pulse-green {
  0%, 100% { box-shadow: 0 0 0px rgba(80, 200, 144, 0); }
  50% { box-shadow: 0 0 6px rgba(80, 200, 144, 0.6); }
}
.task-item-delivery-hint {
  font-size: 0.78rem;
  color: #6a7a6a;
  margin-top: 4px;
}

/* 加载遮罩 */
.loading-overlay {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(10, 10, 15, 0.85);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 100;
  color: #8a7e6a;
}

/* NPC 卡片（友好 · 绿色族） */
.npc-card { --accent: var(--green); }
.card-nature { font-size: 0.7rem; color: var(--text-muted); }

/* 对话弹窗 */
.dialog-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgba(5, 5, 12, 0.7);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.dialog-box {
  width: 500px;
  max-width: 90vw;
  max-height: 80vh;
  background: var(--bg-elev-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-panel);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: var(--text);
}
.dialog-header {
  padding: 12px 16px;
  background: #0d0d1a;
  border-bottom: 1px solid #1a1a3e;
  display: flex;
  align-items: center;
  gap: 10px;
}
.dialog-npc-name {
  color: var(--gold);
  font-weight: bold;
  font-size: 1.1rem;
}
.dialog-npc-info {
  color: #5a5a7a;
  font-size: 0.8rem;
  flex: 1;
}
.dialog-close {
  background: none;
  border: 1px solid #3a3a5a;
  color: #7a7a9a;
  cursor: pointer;
  padding: 2px 8px;
  border-radius: 4px;
}
.dialog-close:hover {
  background: #2a2a3e;
}
.dialog-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 16px;
  min-height: 200px;
  max-height: 50vh;
}
.msg-system {
  color: #4a4a5a;
  font-style: italic;
  text-align: center;
  margin-bottom: 12px;
}
.msg-pair {
  margin-bottom: 12px;
}
.msg-player {
  color: #7a9ec2;
  margin-bottom: 4px;
  padding-left: 8px;
  border-left: 2px solid #3a5a7a;
}
.msg-npc {
  color: #d0c8b8;
  background: #161630;
  padding: 8px 12px;
  border-radius: 6px;
  margin-top: 4px;
}
.msg-loading {
  color: #5a5a6a;
  font-style: italic;
  text-align: center;
}

/* 任务卡片 */
.task-card {
  margin-top: 10px;
  background: rgba(240, 192, 64, 0.06);
  border: 1px solid rgba(240, 192, 64, 0.25);
  border-radius: 6px;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.task-card-title {
  font-size: 0.8rem;
  color: #f0c040;
  font-weight: bold;
  letter-spacing: 0.05rem;
}
.task-card-star {
  color: #ff8c00;
  font-size: 0.85rem;
}
.task-reward-tag {
  background: #2a2010;
  color: #f0c040;
  padding: 1px 8px;
  border-radius: 10px;
  font-size: 0.8rem;
  border: 1px solid #5a4a20;
  margin-right: 4px;
}
.task-card-body {
  font-size: 0.88rem;
  color: #c8c0b0;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 2px;
}
.task-label {
  color: #8a8a9a;
  margin-right: 2px;
}
.task-arrow {
  color: #5a5a6a;
  margin: 0 2px;
}
.task-loc-link {
  color: #60b0f0;
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
  font-weight: 500;
  transition: color 0.15s;
}
.task-loc-link:hover {
  color: #90d0ff;
}
.task-mob {
  color: #e74c3c;
  font-weight: bold;
}
.task-kill {
  color: #f0a040;
  margin-left: 4px;
}
.task-card-progress {
  font-size: 0.78rem;
  color: #5a5a6a;
}
.task-card-actions {
  margin-top: 4px;
}
.task-accepted-tip {
  font-size: 0.8rem;
  color: #50c080;
  margin-top: 4px;
}
.task-error-tip {
  font-size: 0.8rem;
  color: #e05050;
  margin-top: 4px;
}
.dialog-input {
  padding: 10px 12px;
  border-top: 1px solid #1a1a3e;
  display: flex;
  gap: 8px;
}
/* 快捷对话选项 */
.dialog-events {
  padding: 8px 12px;
  border-top: 1px solid #1a1a3e;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.event-btn {
  padding: 5px 12px;
  border-radius: 14px;
  border: 1px solid #3a3a6e;
  background: #151530;
  color: #a0b0d0;
  font-size: 0.8rem;
  cursor: pointer;
  transition: all 0.2s;
}
.event-btn:hover {
  background: #252555;
  border-color: #6a6aae;
  color: #d0d8f0;
}
.dialog-input input {
  flex: 1;
  background: #0d0d1a;
  border: 1px solid #2a2a4e;
  color: #e0d6c2;
  padding: 8px 12px;
  border-radius: 6px;
  outline: none;
  font-size: 0.9rem;
}
.dialog-input input:focus {
  border-color: #4a4a6e;
}
.dialog-input button {
  background: #f0c040;
  color: #0a0a0f;
  border: none;
  padding: 8px 18px;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
}
.dialog-input button:disabled {
  background: #3a3a4a;
  color: #5a5a6a;
  cursor: not-allowed;
}

/* 背包弹窗 */
.backpack-panel {
  width: 760px;
  max-width: 96vw;
  height: 80vh;
  max-height: 680px;
  display: flex;
  flex-direction: column;
}
.backpack-money {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 16px;
  border-bottom: 1px solid var(--border);
  background: var(--bg-elev-2);
}
.money-icon { font-size: 1.1rem; }
.money-value {
  color: var(--gold);
  font-weight: bold;
  font-size: 1.1rem;
}
.money-unit {
  color: var(--text-muted);
  font-size: 0.82rem;
}
.backpack-body {
  flex: 1;
  overflow-y: auto;
  padding: 14px 16px;
}
.backpack-empty {
  color: var(--text-dim);
  text-align: center;
  padding: 32px 0;
  font-size: 0.95rem;
  font-style: italic;
}

/* RPG 格子背包 */
.bp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(96px, 1fr));
  gap: 12px;
}
.bp-slot {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: 10px 4px 8px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  user-select: none;
  transition: transform var(--transition), border-color var(--transition), background var(--transition);
}
.bp-slot:hover {
  transform: translateY(-2px);
  border-color: var(--gold);
  background: color-mix(in srgb, var(--gold) 10%, var(--bg-elev-2));
}
/* 可使用物品：绿色描边暗示可右键使用 */
.bp-slot.is-usable { border-color: rgba(80, 200, 120, 0.45); }
.bp-slot.is-usable:hover {
  border-color: var(--green);
  background: color-mix(in srgb, var(--green) 12%, var(--bg-elev-2));
}
.bp-slot__icon {
  font-size: 2.3rem;
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
}
.bp-slot__img {
  width: 2.6rem;
  height: 2.6rem;
  object-fit: contain;
  filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.5));
  pointer-events: none;
}
.bp-slot__name {
  font-size: 0.76rem;
  color: var(--text-muted);
  text-align: center;
  line-height: 1.2;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
/* 右下角数量徽标（仅 count>1 显示） */
.bp-slot__count {
  position: absolute;
  right: 3px;
  bottom: 3px;
  min-width: 17px;
  height: 17px;
  padding: 0 4px;
  font-size: 0.68rem;
  font-weight: 700;
  color: #fff;
  background: rgba(0, 0, 0, 0.72);
  border-radius: var(--radius-pill);
  text-align: center;
  line-height: 17px;
}

/* 物品悬浮信息（fixed + Teleport，脱离背包滚动容器裁切） */
.item-tip {
  position: fixed;
  z-index: var(--z-tooltip);
  background: var(--bg-elev-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius);
  padding: 10px 12px;
  box-shadow: var(--shadow-panel);
  pointer-events: none;
}
.tooltip-name {
  color: var(--gold);
  font-size: 0.88rem;
  font-weight: bold;
  margin-bottom: 5px;
}
.tooltip-desc {
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.55;
  margin-bottom: 5px;
}
.tooltip-price {
  color: var(--gold);
  font-size: 0.8rem;
  padding-top: 5px;
  border-top: 1px solid var(--border);
}
.tooltip-hint {
  margin-top: 5px;
  font-size: 0.74rem;
  color: var(--green);
  letter-spacing: 0.05em;
}

/* 交易弹窗 */
.trade-panel { max-height: 80vh; height: 70vh; width: 850px; max-width: 96vw; display: flex; flex-direction: column; }
.trade-body { display: flex; flex: 1; overflow: hidden; }
.trade-side { flex: 1; overflow-y: auto; padding: 12px; }
.trade-npc { border-right: 1px solid #2a2a3a; }
.trade-side-title { font-size: 0.9rem; color: #c0c0cc; font-weight: bold; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #2a2a3a; display: flex; justify-content: space-between; align-items: center; position: sticky; top: 0; background: #15151e; z-index: 1; }
.trade-money { font-size: 0.82rem; color: #f0c040; font-weight: normal; }
.trade-empty { color: #5a5a6a; text-align: center; padding: 32px 0; font-size: 0.9rem; }
/* 交易格子：与背包弹窗共用 .bp-slot，两侧展示一致；仅底部多一个操作按钮 */
.trade-side .bp-grid { grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 10px; }
.trade-slot { padding-bottom: 4px; }
.trade-slot-btn {
  margin-top: 2px;
  width: 100%;
  padding: 3px 4px;
  font-size: 0.7rem;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-pill);
  cursor: pointer;
  transition: filter var(--transition), opacity var(--transition);
}
.trade-slot-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.trade-slot-btn:not(:disabled):hover { filter: brightness(1.12); }
.trade-slot-btn--buy { background: #2a3348; color: #8ab4ff; }
.trade-slot-btn--sell { background: #243024; color: #7fd09a; }
/* btn-sell / btn-use → 统一使用 .btn 基类 */

/* 斗技按钮 */
/* 斗技弹窗 */
.skill-panel {
  width: 460px;
  max-width: 95vw;
  max-height: 80vh;
  display: flex;
  flex-direction: column;
}
.skill-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 20px;
  overflow-y: auto;
}
.skill-slots-title,
.skill-inventory-title {
  font-size: 0.85rem;
  color: #a0a0b0;
  margin-bottom: 10px;
  letter-spacing: 0.05rem;
}
.skill-slots-row {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.skill-slot {
  width: 64px;
  height: 64px;
  background: #151520;
  border: 2px dashed #3a3a4a;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.skill-slot.occupied {
  border-style: solid;
  border-color: #7a4a40;
  background: #2a1a18;
}
.skill-slot:hover {
  border-color: #e08060;
  background: #2a1a18;
}
.skill-slot-empty {
  color: #4a4a5a;
  font-size: 1.2rem;
  font-weight: bold;
}
/* 战斗/副本按钮 → 统一使用 .btn 基类 */

/* ===== 副本界面 ===== */
.dungeon-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 2000;
}
.dungeon-box {
  width: 840px;
  max-width: 95vw;
  max-height: 92vh;
  overflow-y: auto;
  background: linear-gradient(160deg, #0a1a18, #0c1c28);
  border: 1px solid #2a5a4a;
  border-radius: 16px;
  box-shadow: 0 0 60px rgba(40, 120, 100, 0.2);
  padding: 36px 30px 28px;
  position: relative;
}
.dungeon-loading {
  text-align: center;
  color: #6a8a7a;
  padding: 40px 0;
}
.dungeon-header {
  text-align: center;
  margin-bottom: 18px;
}
.dungeon-scene-tag {
  display: inline-block;
  font-size: 0.78rem;
  color: #40c0a0;
  border: 1px solid #2a5a4a;
  border-radius: 12px;
  padding: 2px 12px;
  margin-bottom: 8px;
}
.dungeon-title {
  font-size: 1.4rem;
  font-weight: bold;
  color: #d0e8e0;
  letter-spacing: 2px;
}
.dungeon-progress {
  font-size: 0.82rem;
  color: #6a8a7a;
  margin-top: 4px;
}
.dungeon-intro {
  color: #8a9a90;
  font-style: italic;
  font-size: 0.9rem;
  line-height: 1.6;
  border-left: 2px solid #2a5a4a;
  padding: 6px 12px;
  margin-bottom: 18px;
}
.dungeon-stage {
  background: rgba(20, 40, 36, 0.5);
  border: 1px solid #1f3a34;
  border-radius: 10px;
  padding: 18px 20px;
  margin-bottom: 16px;
}
.dungeon-act-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}
.dungeon-act-title {
  color: #c0d8d0;
  font-size: 1.02rem;
  font-weight: bold;
}
.dungeon-act-type {
  font-size: 0.75rem;
  color: #40c0a0;
  border: 1px solid #2a5a4a;
  border-radius: 10px;
  padding: 1px 8px;
}
.dungeon-narrative {
  color: #b0c4be;
  font-size: 0.95rem;
  line-height: 1.7;
}
.dungeon-stars { color: #f0c040; letter-spacing: 1px; margin-right: 6px; }
.dungeon-reveal { margin-top: 12px; padding: 10px 14px; background: linear-gradient(90deg, #2a2010, #1a1408); border: 1px solid #6a5020; border-left: 3px solid #f0c040; border-radius: 6px; color: #f0d070; font-size: 0.95rem; letter-spacing: 0.5px; }
/* 副本主体两栏 */
.dungeon-main { display: flex; gap: 18px; align-items: stretch; }
.dungeon-flow { flex: 1 1 auto; min-width: 0; }
.dungeon-side { flex: 0 0 300px; display: flex; flex-direction: column; background: #0c1410; border: 1px solid #1e3a32; border-radius: 10px; overflow: hidden; }
.side-tabs { display: flex; border-bottom: 1px solid #1e3a32; }
.side-tab { flex: 1; text-align: center; padding: 9px 0; font-size: 0.88rem; color: #6f9a8a; cursor: pointer; transition: all 0.15s; }
.side-tab.active { color: #d0f0e0; background: #14302a; border-bottom: 2px solid #40c0a0; }
.side-body { padding: 12px; overflow-y: auto; max-height: 60vh; }
.side-role-head { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; padding-bottom: 8px; border-bottom: 1px solid #1c3028; }
.side-role-name { color: #e0d8c8; font-size: 1rem; font-weight: bold; }
.side-role-level { color: #40c0a0; font-size: 0.78rem; }
.side-vital-row { display: flex; justify-content: space-between; font-size: 0.8rem; color: #9fc8b8; padding: 3px 0; }
.side-attr { display: flex; justify-content: space-between; font-size: 0.8rem; color: #9fc8b8; padding: 3px 0; border-top: 1px dashed #1c3028; }
.side-attr-label { color: #7a9a8a; }
.side-attr-val { color: #d0c8b8; }
.side-cult { margin-top: 8px; padding-top: 8px; border-top: 1px solid #1c3028; font-size: 0.78rem; color: #6f9a8a; }
.side-section { margin-bottom: 14px; }
.side-section:last-child { margin-bottom: 0; }
.side-section-title { font-size: 0.8rem; color: #8aa89c; margin-bottom: 6px; }
.side-section-hint { color: #5a7a6e; font-size: 0.72rem; }
.side-item { display: flex; align-items: center; gap: 6px; padding: 5px 2px; border-bottom: 1px solid #16221d; }
.side-item:last-child { border-bottom: none; }
.side-item-name { color: #d0c8b8; font-size: 0.82rem; flex: 1; }
.side-item-count { color: #50c878; font-size: 0.8rem; }
.side-empty { color: #5a7a6e; font-size: 0.8rem; padding: 8px 0; text-align: center; }
.dungeon-dots {
  display: flex;
  justify-content: center;
  gap: 12px;
  margin-bottom: 18px;
}
.dungeon-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #1a2a26;
  border: 1px solid #2a4a44;
}
.dungeon-dot.done {
  background: #2a6a58;
  border-color: #40a088;
}
.dungeon-dot.cur {
  background: #40c0a0;
  border-color: #60e0c0;
  box-shadow: 0 0 8px rgba(64, 192, 160, 0.6);
}
.dungeon-dot.boss {
  width: 18px;
  height: 18px;
  border-radius: 3px;
}
.dungeon-actions {
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  gap: 12px;
}
.dungeon-settle {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}
.dungeon-btn {
  min-width: 128px;
  padding: 11px 24px;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid;
}
.dungeon-btn-primary {
  background: linear-gradient(135deg, #18403a, #206050);
  border-color: #40a088;
  color: #d0f0e8;
}
.dungeon-btn-primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #206050, #2a8068);
}
.dungeon-btn-escape {
  background: transparent;
  border-color: #5a3a3a;
  color: #a07070;
  width: 50%;
  padding: 8px 0;
  font-size: 0.88rem;
}
.dungeon-btn-escape:hover:not(:disabled) {
  background: rgba(80, 40, 40, 0.3);
}
.dungeon-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.dungeon-settle-text {  color: #c0d8d0;
  font-size: 1rem;
  margin-bottom: 6px;
}

/* ===== 战斗界面 ===== */
.battle-overlay {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--space-5);
  background: rgba(5, 5, 12, 0.8);
  backdrop-filter: blur(3px);
  -webkit-backdrop-filter: blur(3px);
}
.battle-box {
  width: 880px;
  max-width: 96vw;
  background: var(--bg-elev-1);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-panel);
  overflow: hidden;
  position: relative;
  color: var(--text);
}
.battle-close {
  position: absolute;
  top: 12px;
  right: 16px;
  background: none;
  border: none;
  color: var(--text-muted);
  font-size: 1.6rem;
  cursor: pointer;
  z-index: 2;
}
.battle-close:hover { color: var(--text); }

/* ===== 战斗舞台：玩家/怪物同结构，立绘作背景，状态悬浮其上 ===== */
.battle-field {
  display: flex;
  align-items: stretch;
  justify-content: center;
  padding: 28px 28px 22px;
  gap: 22px;
}

.fighter {
  position: relative;
  width: 310px;
  height: 400px;
  border-radius: 14px;
  overflow: hidden;
  border: 1px solid var(--border-strong);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
  background: #0c0c16;
}

/* 背景：图片 / 占位铺满整个舞台 */
.fighter-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center top;
}
.fighter-bg--mob {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 9rem;
  background: radial-gradient(circle at 50% 42%, #2a1424 0%, #120c18 70%, #0a0a12 100%);
  filter: drop-shadow(0 6px 14px rgba(0, 0, 0, 0.6));
}

/* 遮罩：压暗顶部（保证状态可读）与底部（保证名牌可读） */
.fighter-shade {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(180deg, rgba(0, 0, 0, 0.72) 0%, rgba(0, 0, 0, 0.12) 28%, rgba(0, 0, 0, 0) 48%, rgba(0, 0, 0, 0.1) 62%, rgba(0, 0, 0, 0.8) 100%);
}

/* 悬浮状态层：左上角、左对齐（不居中） */
.fighter-hud {
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
}
.stat-line {
  display: flex;
  flex-direction: column;
  gap: 3px;
  width: 100%;
  max-width: 252px;
}
.stat-line--ghost { opacity: 0; pointer-events: none; }
.bar-cap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
}
.stat-ico { font-size: 0.85rem; width: 13px; text-align: center; flex-shrink: 0; }
.ico-hp { color: #ff6b6b; }
.ico-energy { color: #7aa0e8; }
.bar {
  position: relative;
  width: 100%;
  height: 12px;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 6px;
  overflow: hidden;
}
.bar i { display: block; height: 100%; border-radius: 6px; transition: width 0.4s ease; }
.fill-hp { background: linear-gradient(90deg, #c0392b, #ff6b6b); box-shadow: 0 0 8px rgba(255, 107, 107, 0.5); }
.fill-energy { background: linear-gradient(90deg, #2a4a8a, #6ea0e8); box-shadow: 0 0 8px rgba(110, 160, 232, 0.45); }
.bar-num {
  font-size: 0.72rem;
  font-weight: 700;
  color: #f0f0f5;
  text-shadow: 0 1px 2px #000;
}

/* buff 行（悬浮组件看名称 + 效果） */
.buff-row { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 2px; }
.buff {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  font-size: 1.02rem;
  padding: 2px 5px;
  border-radius: 5px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid rgba(255, 255, 255, 0.18);
  line-height: 1;
  cursor: help;
  transition: border-color 0.12s ease, background 0.12s ease;
}
.buff:hover { background: rgba(0, 0, 0, 0.75); border-color: rgba(255, 210, 74, 0.6); }
.buff em { font-style: normal; font-size: 0.62rem; color: #ffd24a; }

/* buff 悬浮组件（fixed，脱离战斗框 overflow:hidden） */
.buff-tooltip {
  position: fixed;
  z-index: var(--z-tooltip);
  padding: 7px 10px;
  background: rgba(15, 15, 22, 0.97);
  border: 1px solid rgba(255, 210, 74, 0.5);
  border-radius: 7px;
  font-size: 0.74rem;
  font-weight: 400;
  line-height: 1.45;
  color: #e8e2d0;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.65);
  pointer-events: none;
}
.buff-tooltip .bt-name { color: #ffd24a; font-weight: 700; }
.buff-tooltip .bt-stack { color: #ffd24a; }
.buff-tooltip .bt-dur { color: #9fb4e0; }

/* 受击：整舞台立体抖动 + 背景红闪 */
.fighter.hurt { animation: hurtShake 0.42s ease; }
.fighter.hurt .fighter-bg { filter: brightness(1.5) sepia(0.6) hue-rotate(-25deg) saturate(2.2); }
@keyframes hurtShake {
  0%   { transform: translate(0, 0) rotate(0) scale(1); }
  15%  { transform: translate(-10px, 3px) rotate(-4deg) scale(1.02); }
  30%  { transform: translate(9px, -3px) rotate(4deg) scale(1.02); }
  45%  { transform: translate(-7px, 2px) rotate(-3deg); }
  60%  { transform: translate(5px, -2px) rotate(2deg); }
  75%  { transform: translate(-3px, 1px) rotate(-1deg); }
  100% { transform: translate(0, 0) rotate(0) scale(1); }
}

/* 浮动伤害数字 */
.floaters { position: absolute; inset: 0; pointer-events: none; overflow: visible; z-index: 3; }
.floater {
  position: absolute;
  top: 36%;
  transform: translateX(-50%);
  font-weight: 800;
  font-size: 1.9rem;
  color: #fff;
  text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 0.9);
  animation: floatUp 0.95s ease-out forwards;
  white-space: nowrap;
}
.floater.crit { color: #ffd24a; font-size: 2.4rem; text-shadow: 0 2px 6px rgba(0, 0, 0, 0.95), 0 0 12px rgba(255, 210, 74, 0.85); }
.floater.heal { color: #6ee89a; }
@keyframes floatUp {
  0%   { opacity: 0; transform: translate(-50%, 16px) scale(0.5); }
  18%  { opacity: 1; transform: translate(-50%, -10px) scale(1.2); }
  100% { opacity: 0; transform: translate(-50%, -90px) scale(1); }
}

/* 名牌（底部左对齐） */
.fighter-name {
  position: absolute;
  left: 12px;
  right: 12px;
  bottom: 10px;
  z-index: 2;
  color: #f0f0f5;
  font-weight: 700;
  font-size: 1.02rem;
  text-shadow: 0 1px 4px #000, 0 0 6px rgba(0, 0, 0, 0.8);
}

.battle-vs {
  align-self: center;
  flex-shrink: 0;
  color: var(--gold);
  font-size: 1.8rem;
  filter: drop-shadow(0 0 10px rgba(240, 192, 64, 0.55));
}


.battle-actions {
  display: flex;
  gap: 16px;
  justify-content: center;
  align-items: center;
  padding: 18px 30px 24px;
  border-top: 1px solid var(--border);
}
/* battle-btn* → 统一使用 .btn 基类 */

.battle-skill-slots { display: flex; gap: 6px; }
.battle-skill-slot {
  width: 78px;
  padding: 8px 6px;
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  transition: border-color var(--transition), background var(--transition), transform var(--transition);
}
.battle-skill-slot.filled { border-color: rgba(192,160,240,0.5); background: rgba(192,160,240,0.08); cursor: pointer; }
.battle-skill-slot.filled:hover:not(.skill-disabled) { border-color: var(--purple); background: rgba(192,160,240,0.16); transform: translateY(-1px); }
.battle-skill-slot.skill-disabled { opacity: 0.4; cursor: not-allowed; }
.bss-name { color: var(--purple); font-size: 0.74rem; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 70px; }
.bss-cost { color: var(--text-muted); font-size: 0.65rem; }
.bss-empty { color: var(--text-dim); font-size: 0.7rem; }

.battle-loading { text-align: center; padding: 70px 0; color: var(--text-muted); font-size: 1rem; }

/* 战斗结果横幅（fixed 全屏，不依赖父容器定位） */
.battle-result {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.6);
  z-index: 2150;
  animation: br-in 0.3s ease;
}
@keyframes br-in { from { opacity: 0; transform: scale(1.1); } to { opacity: 1; transform: scale(1); } }
.battle-result-text {
  font-size: 3.2rem;
  letter-spacing: 14px;
  font-family: "Noto Serif SC", "Songti SC", serif;
  text-shadow: 0 0 24px currentColor;
}
.battle-result.is-win .battle-result-text { color: #f0c040; }
.battle-result.is-lose .battle-result-text { color: #c05060; }

/* ===== 室内修炼悬浮卡片 ===== */
.cult-room-float {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 220px;
  background: linear-gradient(145deg, #12121c, #1a1a2e);
  border: 1px solid #2f5a4a;
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(0,0,0,0.6), 0 0 0 1px rgba(111,191,168,0.18);
  padding: 12px 14px;
  z-index: 1000;
}
.cult-room-float-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.cult-room-float-title { font-size: 0.9rem; color: #e0e0ec; font-weight: 600; }
.cult-room-float-mode { font-size: 0.74rem; color: #6fbfa8; }
.cult-room-float-bar { height: 8px; background: rgba(0,0,0,0.4); border: 1px solid var(--border); border-radius: 6px; overflow: hidden; margin-bottom: 10px; }
.cult-room-float-fill { height: 100%; background: linear-gradient(90deg, #3a8f78, #6fbfa8); transition: width 0.35s ease; }
.cult-room-float-foot { display: flex; gap: 8px; }
.cult-room-float-btn { flex: 1; padding: 4px 0; font-size: 0.78rem; border-radius: var(--radius); cursor: pointer; transition: filter var(--transition); }
.cult-room-float-btn:hover { filter: brightness(1.15); }
.cult-room-float-btn.expand { color: #c0c0cc; background: rgba(50,50,64,0.5); border: 1px solid var(--border); }
.cult-room-float-btn.stop { color: #e08060; background: rgba(70,40,36,0.4); border: 1px solid #5a2e28; }

/* ===== 浮动历练卡片 ===== */
.training-float {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 360px;
  max-height: 480px;
  background: linear-gradient(145deg, #12121c, #1a1a2e);
  border: 1px solid #3a3a5a;
  border-radius: 14px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(240,192,64,0.15);
  display: flex;
  flex-direction: column;
  z-index: 1000;
  overflow: hidden;
}
/* 采集卡：与历练卡并排，偏移到左侧避免重叠遮挡 */
.gather-float {
  right: 400px;
}
.training-float-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid #2a2a3e;
  background: rgba(240,192,64,0.06);
}
.training-float-title {
  color: #f0c040;
  font-weight: bold;
  font-size: 0.95rem;
}
.training-float-toggle {
  margin-left: auto;
  color: #8a7a4a;
  font-size: 0.85rem;
  cursor: pointer;
  user-select: none;
}
.training-float-stop {
  background: #3a2020;
  border: 1px solid #6a3030;
  color: #e06060;
  padding: 4px 14px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}
.training-float-stop:hover {
  background: #5a2828;
  border-color: #8a4040;
}
.training-float-stop.start {
  background: #1e3a2e;
  border-color: #2e5a44;
  color: #6fbf8a;
}
.training-float-stop.start:hover {
  background: #264a38;
  border-color: #3e7a64;
}
.training-float-body {
  flex: 1;
  overflow-y: auto;
  padding: 10px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 60px;
}
.training-float-body::-webkit-scrollbar {
  width: 4px;
}
.training-float-body::-webkit-scrollbar-thumb {
  background: #3a3a5a;
  border-radius: 2px;
}
.training-float-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 20px 0;
  color: #6a6a8a;
  font-size: 0.85rem;
}
.spinner-sm {
  width: 20px;
  height: 20px;
  border: 2px solid #3a3a4a;
  border-top-color: #f0c040;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.float-log-entry {
  padding: 10px 12px;
  background: #0e0e18;
  border: 1px solid #1e1e30;
  border-radius: 8px;
  font-size: 0.82rem;
  line-height: 1.5;
}
.float-log-lost {
  border-color: #3a2020;
  background: #120a0a;
}
.float-log-text {
  color: #d0d0dc;
  margin: 0 0 4px 0;
}
.float-log-drops {
  color: #50c878;
  font-size: 0.78rem;
  margin-top: 2px;
}
.float-drop-item {
  color: #60d888;
}
.float-log-task {
  margin-top: 2px;
  font-size: 0.76rem;
}
.float-task-upd {
  display: block;
  color: #90a0c0;
}
.float-task-upd.upd-done {
  color: #50c878;
}
.float-log-meta {
  display: block;
  margin-top: 4px;
  color: #6a6a8a;
  font-size: 0.74rem;
}
.float-log-encounter {
  margin-top: 4px;
  padding: 4px 8px;
  font-size: 0.78rem;
  color: #6fbfa8;
  background: rgba(30, 74, 62, 0.3);
  border-left: 2px solid #6fbfa8;
  border-radius: 3px;
}
.float-enc-scene { color: #5a8a7a; font-size: 0.72rem; }
</style>
