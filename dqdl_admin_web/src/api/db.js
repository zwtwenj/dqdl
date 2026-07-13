import http from './request'

/** 所有表 GET /api/db/tables */
export const getTables = () => http.get('/db/tables')

/** 表字段 GET /api/db/tables/:table/columns */
export const getColumns = (table) => http.get(`/db/tables/${table}/columns`)

/** 表数据分页 GET /api/db/tables/:table/data?page=&size= */
export const getData = (table, page = 1, size = 50) =>
  http.get(`/db/tables/${table}/data`, { params: { page, size } })
