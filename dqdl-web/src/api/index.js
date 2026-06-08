import axios from 'axios'

const api = axios.create({
  baseURL: '/api',
  timeout: 60000,
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

// NPC API
export const getNpcsByLocation = (locationId) => api.get(`/npc/location/${locationId}`)
export const talkToNpc = (npcId, message, history) => api.post(`/npc/${npcId}/talk`, { message, history })

// Training API
export const doTraining = (playerId, locationId) => api.post(`/location/training?playerId=${playerId}&locationId=${locationId}`)

export default api
