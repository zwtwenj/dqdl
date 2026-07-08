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
  expandLocation,
  getLocation,
} from './location'
export { getPlayer, getPlayerStatus, cultivate, breakthrough } from './player'
