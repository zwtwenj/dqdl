import http from './request'

/** 开始历练 POST /api/training/start */
export const startTraining = () => http.post('/training/start')

/** 停止历练 POST /api/training/stop */
export const stopTraining = () => http.post('/training/stop')

/** 查当前进行中的历练 + 全部日志 GET /api/training/active
 *  前端初始化用（进入游戏/发起历练后拉全量）。 */
export const getActiveTraining = () => http.get('/training/active')

/** 增量日志：GET /api/training/logs/new?afterLogId=xxx
 *  返回 { logs, active, finished }：id > afterLogId 的新日志。
 *  前端轮询用——初始化拉全量，之后只拉增量，避免重复传输。 */
export const getNewTrainingLogs = (afterLogId) =>
  http.get('/training/logs/new', { params: { afterLogId } })
