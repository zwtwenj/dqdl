import http from './request'

/**
 * 查询所有宝物定义（供前端缓存，tooltip 显示属性用）。
 * GET /api/treasure → Treasure[]
 * 每项含 id/name/item_id/category/rank/stats/effects/description
 */
export const getAllTreasures = () =>
  http.get('/treasure')
