import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { DbViewerService } from './db-viewer.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 数据库只读浏览接口（全部需管理员鉴权）。
 * 自动发现当前库所有表 + 字段 + 分页数据，纯只读。
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class DbViewerController {
  constructor(private readonly dbViewer: DbViewerService) {}

  /** 所有表 GET /api/db/tables */
  @Get('db/tables')
  tables() {
    return this.dbViewer.listTables();
  }

  /** 表字段 GET /api/db/tables/:table/columns */
  @Get('db/tables/:table/columns')
  columns(@Param('table') table: string) {
    return this.dbViewer.listColumns(table);
  }

  /** 表数据分页 GET /api/db/tables/:table/data?page=1&size=50 */
  @Get('db/tables/:table/data')
  data(
    @Param('table') table: string,
    @Query('page') page?: string,
    @Query('size') size?: string,
  ) {
    return this.dbViewer.listData(table, Number(page) || 1, Number(size) || 50);
  }
}
