import http from './request'

/** 按 call_type 聚合统计 GET /api/agent-log/summary?days=7 */
export const getSummary = (days = 7) => http.get('/agent-log/summary', { params: { days } })

/** 按天趋势 GET /api/agent-log/trend?days=7 */
export const getTrend = (days = 7) => http.get('/agent-log/trend', { params: { days } })

/** 调用明细分页 GET /api/agent-log/list */
export const getLogList = (page = 1, size = 20, callType) =>
  http.get('/agent-log/list', { params: { page, size, call_type: callType || undefined } })

/** 对话调用明细分页 GET /api/agent-dialog/list */
export const getDialogList = (page = 1, size = 20) =>
  http.get('/agent-dialog/list', { params: { page, size } })
