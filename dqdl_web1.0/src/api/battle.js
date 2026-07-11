import http from './request'

/** 开始战斗 POST /api/battle/start { mobId } */
export const startBattle = (mobId) => http.post('/battle/start', { mobId })

/** 玩家行动 POST /api/battle/action { type, slot } */
export const battleAction = (type, slot) => http.post('/battle/action', { type, slot })

/** 查询当前战斗快照 GET /api/battle/state */
export const getBattleState = () => http.get('/battle/state')

/** 逃跑 POST /api/battle/flee */
export const fleeBattle = () => http.post('/battle/flee')
