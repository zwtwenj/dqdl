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

// NPC API
export const getNpcsByLocation = (locationId) => api.get(`/npc/location/${locationId}`)
export const talkToNpc = (npcId, message, history) => api.post(`/npc/${npcId}/talk`, { message, history })

// Training API
export const doTraining = (playerId, locationId) => api.post(`/location/training?playerId=${playerId}&locationId=${locationId}`)

// Backpack API
export const getBackpack = (playerId) => api.get('/backpack/' + playerId)

// Task API
export const generateTask = (locationId) => api.post('/task/generate', { location_id: locationId })
export const acceptTask = (playerId, description, target, reward, delivery, star) => api.post('/task/accept', { player_id: playerId, description, target, reward: reward || [], delivery: delivery || null, star: star || 1 })
export const completeAdventurerTasks = (playerId, npcId) => api.post('/task/complete-adventurer', { player_id: playerId, npc_id: npcId })
export const getPlayerTasks = (playerId) => api.get('/task/player/' + playerId)

export default api
