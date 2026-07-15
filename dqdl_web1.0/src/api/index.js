/**
 * API 汇总出口。按模块拆分，统一从 request.js 走 axios 拦截器。
 * 调用方直接 import { login, getCharacters, ... } from '@/api'
 */
export { login, register } from './auth'
export {
  getCharacters,
  createCharacter,
  enterCharacter,
  deleteCharacter,
} from './character'
export {
  getRootLocation,
  getLocationChildren,
  getLocationSiblings,
  expandLocation,
  getLocation,
} from './location'
export { getPlayer, getPlayerStatus, cultivate, breakthrough, movePlayerLocation, updatePlayerSkills } from './player'
export { startTraining, stopTraining, getActiveTraining } from './training'
export { getBackpack, moveBackpackItem, sortBackpack } from './backpack'
export { startBattle, battleAction, getBattleState, fleeBattle } from './battle'
export { getNpc, getNpcsByLocation, createNpcSession, talkInSession } from './npc'
export { getNpcShop, buyItem, sellItem } from './shop'
export { usePill } from './pill'
export { getEncounters, abandonEncounter } from './encounter'
export { enterDungeon, getCurrentDungeon, nextDungeonAct, escapeDungeon, winDungeonAct, failDungeon } from './dungeon'
export { enterCultivation, getCurrentCultivation, stopCultivation, cultivationStreamUrl } from './cultivation'
