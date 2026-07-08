import http from './request'

/** 开始历练 POST /api/training/start */
export const startTraining = () => http.post('/training/start')

/** 停止历练 POST /api/training/stop */
export const stopTraining = () => http.post('/training/stop')

/** 查当前进行中的历练 + 日志 GET /api/training/active */
export const getActiveTraining = () => http.get('/training/active')
