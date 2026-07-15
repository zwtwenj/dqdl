<script setup>
import { ref, watch, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { createCharacter, enterCharacter, deleteCharacter } from '../api'
import { bus, BusEvents } from '../utils/eventBus'
import LoginPanel from '../components/LoginPanel.vue'
import CharacterSelectDialog from '../components/CharacterSelectDialog.vue'
import CreatePlayerDialog from '../components/CreatePlayerDialog.vue'

const auth = useAuthStore()
const router = useRouter()
const loading = ref(false)

/** 弹 toast 提示 */
function toast(type, message) {
  bus.emit(BusEvents.TOAST, { type, message })
}

/** 角色选择弹窗（登录后或刷新已登录时自动弹出） */
const charDialogVisible = ref(false)

/** 姓名输入弹窗（选空位创建角色时弹出） */
const nameDialogVisible = ref(false)
const pendingSlot = ref(null)

/** 拉取角色列表并弹出选择弹窗（登录后 / 刷新已登录 复用） */
async function showCharacterDialog() {
  try {
    await auth.fetchCharacters()
    charDialogVisible.value = true
  } catch (err) {
    // token 失效等：request.js 已处理跳登录，这里不重复弹窗
    console.warn('拉取角色列表失败:', err.message)
  }
}

/** 进入页面时：若已登录（刷新场景），直接拉角色并弹窗 */
onMounted(() => {
  if (auth.isLoggedIn) {
    showCharacterDialog()
  }
})

/** 登录成功后自动弹出角色选择（store.login 成功后 isLoggedIn 变 true） */
watch(() => auth.isLoggedIn, (v) => {
  if (v) showCharacterDialog()
})

/** 选已有角色 → 进入游戏 */
async function onCharacterSelect(slot) {
  charDialogVisible.value = false
  loading.value = true
  try {
    const data = await enterCharacter(slot)
    const { character, player, rootLocationId } = data
    console.log('进入角色', { characterId: character.id, playerId: player?.id, rootLocationId })
    enterGameView(character, player, rootLocationId)
  } catch (err) {
    toast('error', err.message || '进入失败')
    charDialogVisible.value = true
  } finally {
    loading.value = false
  }
}

/** 选空位 → 弹姓名输入 */
function onCharacterCreate(slot) {
  pendingSlot.value = slot
  nameDialogVisible.value = true
}

/** 姓名确认 → 创建角色 + player → 进入游戏 */
async function onNameConfirm(name) {
  nameDialogVisible.value = false
  loading.value = true
  try {
    const data = await createCharacter(name)
    const { character, player, rootLocationId } = data
    console.log('角色创建完成', { characterId: character.id, playerId: player.id, rootLocationId })
    charDialogVisible.value = false
    await auth.fetchCharacters()
    enterGameView(character, player, rootLocationId)
  } catch (err) {
    toast('error', err.message || '创建失败')
    charDialogVisible.value = true
  } finally {
    loading.value = false
    pendingSlot.value = null
  }
}

/** 删除角色 */
async function onCharacterDelete(character) {
  loading.value = true
  try {
    await deleteCharacter(character.slot)
    await auth.fetchCharacters()
    toast('success', '角色已删除')
  } catch (err) {
    toast('error', err.message || '删除失败')
  } finally {
    loading.value = false
  }
}

/** 进入游戏主界面 */
function enterGameView(character, player) {
  router.push({
    name: 'game',
    query: { playerId: player?.id },
  })
}

/** 退出登录（清 token + 关闭角色选择弹窗，回到登录面板） */
function onLogout() {
  auth.logout()
  charDialogVisible.value = false
}
</script>

<template>
  <div class="start-page">
    <img
      class="bg"
      src="/ui/bg-continent.webp"
      alt=""
    >

    <h1 class="title">
      斗气大陆
    </h1>
    <p class="subtitle">
      踏破苍穹，逆天改命
    </p>

    <!-- 右上角：用户名 + 退出（登录后显示） -->
    <div
      v-if="auth.isLoggedIn"
      class="top-right"
    >
      <span class="user-name">{{ auth.user?.username }}</span>
      <button
        class="logout-btn"
        @click="onLogout"
      >
        <img
          class="logout-bg"
          src="/ui/loginout.png"
          alt=""
        >
        <span class="logout-text">退出</span>
      </button>
    </div>

    <!-- 未登录：登录面板 -->
    <LoginPanel v-if="!auth.isLoggedIn" />

    <!-- 已登录：不显示新游戏/继续游戏按钮，直接弹角色选择 -->

    <!-- 角色选择弹窗 -->
    <CharacterSelectDialog
      v-model="charDialogVisible"
      :characters="auth.characters"
      @select="onCharacterSelect"
      @create="onCharacterCreate"
      @delete="onCharacterDelete"
      @logout="onLogout"
    />

    <!-- 角色命名弹窗 -->
    <CreatePlayerDialog
      v-model="nameDialogVisible"
      @confirm="onNameConfirm"
    />
  </div>
</template>

<style scoped>
.start-page {
  position: relative;
  width: 100%;
  height: 100vh;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  z-index: 0;
  filter: brightness(0.7);
}

.title {
  position: relative;
  z-index: 1;
  font-size: 72px;
  letter-spacing: 12px;
  margin: 0 0 8px;
  color: #e8d5a0;
  text-shadow: 0 0 20px rgba(0, 0, 0, 0.9), 0 4px 8px rgba(0, 0, 0, 0.7);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

.subtitle {
  position: relative;
  z-index: 1;
  font-size: 18px;
  letter-spacing: 6px;
  margin: 0 0 60px;
  color: #7ec8b0;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
}

.top-right {
  position: absolute;
  top: 24px;
  right: 32px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-name {
  font-size: 15px;
  letter-spacing: 2px;
  color: #6ab8a0;
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}

.logout-btn {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 32px;
  padding: 0;
  border: none;
  background: transparent;
  cursor: pointer;
  transition: transform 0.2s, filter 0.2s;
}

.logout-bg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: fill;
}

.logout-text {
  position: relative;
  z-index: 1;
  font-size: 13px;
  letter-spacing: 2px;
  color: #f0e0b0;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.9);
  font-family: 'STKaiti', 'KaiTi', '楷体', serif;
  pointer-events: none;
}

.logout-btn:hover {
  transform: scale(1.05);
  filter: brightness(1.15);
}
</style>
