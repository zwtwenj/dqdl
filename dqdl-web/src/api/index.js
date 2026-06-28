import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 300000,
})

// Location API
export const getRoots = () => api.get('/location/roots')
export const getLocation = (id) => api.get(`/location/${id}`)
export const getChildren = (id) => api.get(`/location/${id}/children`)
export const getTree = (id) => api.get(`/location/${id}/tree`)

// Player API
export const createPlayer = (data) => api.post('/player', data)
export const getPlayer = (id) => api.get(`/player/${id}`)
export const updatePlayer = (id, data) => api.put(`/player/${id}`, data)
export const updatePlayerPosition = (id, position) => api.patch(`/player/${id}/position`, { position })
export const cultivate = (id, qiDensity) => api.post(`/player/${id}/cultivate`, { qi_density: qiDensity || 0 })
export const breakthrough = (id) => api.post(`/player/${id}/breakthrough`)

// Technique equip/unequip
export const equipTechnique = (playerId, techniqueId) => api.post(`/player/${playerId}/technique/equip`, { techniqueId })
export const unequipTechnique = (playerId) => api.post(`/player/${playerId}/technique/unequip`)
export const breakthroughTechnique = (playerId, techniqueId, rate) => api.post(`/player/${playerId}/technique/breakthrough`, { techniqueId, rate })

// Treasure（宝物：装备经背包"使用"宝物物品；此处仅卸下）
export const unequipTreasure = (playerId, slot) => api.post(`/backpack/${playerId}/treasure/unequip`, { slot })

// NPC API
export const getNpcsByLocation = (locationId) => api.get(`/npc/location/${locationId}`)
export const talkToNpc = (npcId, message, history) => api.post(`/npc/${npcId}/talk`, { message, history })
export const triggerNpcEvent = (npcId, eventId, playerId, history) => api.post(`/npc/${npcId}/event`, { eventId, playerId, history })

// Training API
export const doTraining = (playerId, locationId) => api.post(`/training?playerId=${playerId}&locationId=${locationId}`)
export const startTraining = (playerId) => api.post(`/training/start?playerId=${playerId}`)
export const stopTraining = (playerId) => api.post(`/training/stop?playerId=${playerId}`)
export const setPlayerStatus = (playerId, status) => api.patch(`/player/${playerId}/status`, { status })
export const trainingStreamUrl = (playerId, locationId) => `/api/training/stream?playerId=${playerId}&locationId=${locationId}`

// Skill API
export const getSkills = () => api.get('/skill')
export const getBuffs = () => api.get('/buff')
export const updatePlayerSkills = (playerId, skillJson) => api.put(`/player/${playerId}`, { skill: skillJson })

// Backpack API
export const getBackpack = (playerId) => api.get('/backpack/' + playerId)
export const sellItem = (playerId, name, count) => api.post('/backpack/' + playerId + '/sell', { name, count: count || 1 })
export const useItem = (playerId, name) => api.post('/backpack/' + playerId + '/use', { name })
export const getShopItems = () => api.get('/backpack/shop/items')
export const buyItem = (playerId, itemId, count) => api.post('/backpack/' + playerId + '/buy', { itemId, count: count || 1 })

// Task API
export const generateTask = (locationId) => api.post('/task/generate', { location_id: locationId })
export const acceptTask = (playerId, name, description, target, reward, delivery, star) => api.post('/task/accept', { player_id: playerId, name, description, target, reward: reward || [], delivery: delivery || null, star: star || 1 })
export const completeAdventurerTasks = (playerId, npcId) => api.post('/task/complete-adventurer', { player_id: playerId, npc_id: npcId })
export const getPlayerTasks = (playerId) => api.get('/task/player/' + playerId)

// Dungeon API
export const enterDungeon = (playerId) => api.post(`/dungeon/enter?playerId=${playerId}`)
export const getCurrentDungeon = (playerId) => api.get(`/dungeon/current?playerId=${playerId}`)
export const nextDungeonAct = (playerId) => api.post(`/dungeon/next?playerId=${playerId}`)
export const pickDungeonAct = (playerId) => api.post(`/dungeon/pick?playerId=${playerId}`)
export const useDungeonTempItem = (playerId, name) => api.post(`/dungeon/use?playerId=${playerId}`, { name })
export const escapeDungeon = (playerId) => api.post(`/dungeon/escape?playerId=${playerId}`)
export const failDungeon = (playerId) => api.post(`/dungeon/fail?playerId=${playerId}`)
export const lootDungeon = (playerId) => api.post(`/dungeon/loot?playerId=${playerId}`)

// Encounter API
export const getEncounters = (playerId) => api.get(`/encounter?playerId=${playerId}`)
export const abandonEncounter = (id, playerId) => api.post(`/encounter/${id}/abandon?playerId=${playerId}`)
export const enterFromEncounter = (playerId, encounterId) => api.post(`/dungeon/enter?playerId=${playerId}&encounterId=${encounterId}`)

// Cultivation API
export const cultivationEnter = (playerId, encounterId) => api.post(`/cultivation/enter?playerId=${playerId}&encounterId=${encounterId}`)
export const cultivationCurrent = (playerId) => api.get(`/cultivation/current?playerId=${playerId}`)
export const cultivationStop = (playerId) => api.post(`/cultivation/stop?playerId=${playerId}`)
export const cultivationStreamUrl = (playerId) => `/api/cultivation/stream?playerId=${playerId}`

// Cultivation Room API（城内付费修炼室）
export const cultivationRoomConfig = () => api.get('/cultivation-room/config')
export const enterCultivationRoom = (playerId, tier, mode = 'qi', targetId = null) => {
  const q = `/cultivation-room/enter?playerId=${playerId}&tier=${tier}&mode=${mode}` + (targetId ? `&targetId=${targetId}` : '')
  return api.post(q)
}
export const getCultivationRoom = (playerId) => api.get(`/cultivation-room/current?playerId=${playerId}`)
export const stopCultivationRoom = (playerId) => api.post(`/cultivation-room/stop?playerId=${playerId}`)
export const cultivationRoomStreamUrl = (playerId) => `/api/cultivation-room/stream?playerId=${playerId}`

// Battle API
export const battleStart = (playerId, mobId) => api.post('/battle/start', { playerId, mobId })
export const battleAction = (playerId, body) => api.post('/battle/action', { playerId, ...body })

// Random Event API（场景事件）
export const checkEvent = (playerId, type, payload) => api.post('/event/check', { playerId, type, payload })
export const applyEvent = (playerId, effects) => api.post('/event/apply', { playerId, effects })

export default api
