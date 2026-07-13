import http from './request'

/** 进入/生成秘境 POST /api/dungeon/enter { encounterId? } → 秘境实例（含五幕acts） */
export const enterDungeon = (encounterId) =>
  http.post('/dungeon/enter', encounterId ? { encounterId } : {})

/** 查当前进行中的秘境（刷新恢复用）GET /api/dungeon/current → 秘境实例或 null */
export const getCurrentDungeon = () => http.get('/dungeon/current')

/** 推进下一幕（最后一幕则通关）POST /api/dungeon/next → 秘境实例 */
export const nextDungeonAct = () => http.post('/dungeon/next')

/** 撤退秘境 POST /api/dungeon/escape → 秘境实例 */
export const escapeDungeon = () => http.post('/dungeon/escape')

/** 战斗胜利：标记当前幕已击败 + 掉落进临时背包 POST /api/dungeon/win → 秘境实例 */
export const winDungeonAct = () => http.post('/dungeon/win')

/** 战斗失败：整个秘境失败 POST /api/dungeon/fail → 秘境实例 */
export const failDungeon = () => http.post('/dungeon/fail')
