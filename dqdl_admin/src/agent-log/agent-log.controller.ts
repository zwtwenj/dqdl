import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AgentLogService } from './agent-log.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * Agent 日志接口（全部需管理员鉴权）。
 * summary/trend 提供 ECharts 聚合数据，list/dialogList 提供明细分页。
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class AgentLogController {
  constructor(private readonly agentLog: AgentLogService) {}

  /** 按 call_type 聚合统计 GET /api/agent-log/summary?days=7 */
  @Get('agent-log/summary')
  summary(@Query('days') days?: string) {
    return this.agentLog.summary(Number(days) || 7);
  }

  /** 按天 token 消耗趋势 GET /api/agent-log/trend?days=7 */
  @Get('agent-log/trend')
  trend(@Query('days') days?: string) {
    return this.agentLog.trend(Number(days) || 7);
  }

  /** 调用明细分页 GET /api/agent-log/list?page=1&size=20&call_type=training */
  @Get('agent-log/list')
  list(@Query('page') page?: string, @Query('size') size?: string, @Query('call_type') callType?: string) {
    return this.agentLog.list(Number(page) || 1, Number(size) || 20, callType);
  }

  /** 对话调用明细分页 GET /api/agent-dialog/list?page=1&size=20 */
  @Get('agent-dialog/list')
  dialogList(@Query('page') page?: string, @Query('size') size?: string) {
    return this.agentLog.dialogList(Number(page) || 1, Number(size) || 20);
  }
}
