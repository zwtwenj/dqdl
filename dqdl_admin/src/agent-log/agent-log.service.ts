import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';

/**
 * Agent 日志查询服务（只读）。
 * 直查 agent_call_log（通用 LLM 调用 token 账单）与 agent_dialog_call（对话明细）。
 * 所有方法纯 SELECT，不改任何数据。
 */
@Injectable()
export class AgentLogService {
  constructor(private readonly dataSource: DataSource) {}

  /**
   * 按 call_type 聚合统计（喂 ECharts 饼图/柱状图）。
   * @param days 近 N 天（0=全部）
   */
  async summary(days = 7): Promise<any[]> {
    const where = days > 0
      ? `WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)`
      : `WHERE 1=1`;
    const params = days > 0 ? [days] : [];
    const res = await this.dataSource.query(
      `SELECT
         call_type AS callType,
         COUNT(*) AS totalCalls,
         SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) AS successCalls,
         COALESCE(SUM(total_tokens), 0) AS totalTokens,
         COALESCE(SUM(prompt_tokens), 0) AS promptTokens,
         COALESCE(SUM(completion_tokens), 0) AS completionTokens,
         COALESCE(AVG(duration_ms), 0) AS avgDurationMs
       FROM agent_call_log
       ${where}
       GROUP BY call_type
       ORDER BY totalTokens DESC`,
      params,
    );
    // mysql2 聚合结果数字字段为字符串，统一转 number；并保证返回数组
    const rows = Array.isArray(res) ? res : [res];
    return rows.map((r: any) => ({
      callType: String(r.callType ?? 'unknown'),
      totalCalls: Number(r.totalCalls) || 0,
      successCalls: Number(r.successCalls) || 0,
      totalTokens: Number(r.totalTokens) || 0,
      promptTokens: Number(r.promptTokens) || 0,
      completionTokens: Number(r.completionTokens) || 0,
      avgDurationMs: Number(r.avgDurationMs) || 0,
    }));
  }

  /**
   * 按天聚合 token 消耗趋势（喂 ECharts 折线图）。
   * @param days 近 N 天
   */
  async trend(days = 7): Promise<any[]> {
    const res = await this.dataSource.query(
      `SELECT
         DATE(created_at) AS date,
         COALESCE(SUM(total_tokens), 0) AS totalTokens,
         COUNT(*) AS calls,
         ROUND(SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) / COUNT(*) * 100, 1) AS successRate
       FROM agent_call_log
       WHERE created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
       GROUP BY DATE(created_at)
       ORDER BY date ASC`,
      [days],
    );
    const rows = Array.isArray(res) ? res : [res];
    return rows.map((r: any) => ({
      date: String(r.date ?? '').slice(0, 10), // 只取日期部分
      totalTokens: Number(r.totalTokens) || 0,
      calls: Number(r.calls) || 0,
      successRate: Number(r.successRate) || 0,
    }));
  }

  /**
   * 调用明细列表（分页）。
   */
  async list(page = 1, size = 20, callType?: string): Promise<{ total: number; rows: any[] }> {
    const where = callType ? `WHERE call_type = ?` : `WHERE 1=1`;
    const countParams = callType ? [callType] : [];
    const listParams = callType ? [callType, size, (page - 1) * size] : [size, (page - 1) * size];
    const countRes = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM agent_call_log ${where}`,
      countParams,
    );
    const total = Number(toRows(countRes)[0]?.total) || 0;
    const listRes = await this.dataSource.query(
      `SELECT id, call_type, ref_type, ref_id, model, prompt_tokens, completion_tokens,
              total_tokens, cache_hit_tokens, cache_miss_tokens, cache_hit_ratio,
              temperature, duration_ms, success, error_msg, created_at
       FROM agent_call_log
       ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      listParams,
    );
    return { total, rows: toRows(listRes) };
  }

  /**
   * 对话调用明细（含 messages/player_input/reply）。
   */
  async dialogList(page = 1, size = 20): Promise<{ total: number; rows: any[] }> {
    const countRes = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM agent_dialog_call`,
    );
    const total = Number(toRows(countRes)[0]?.total) || 0;
    const listRes = await this.dataSource.query(
      `SELECT id, server_session_id, call_index, messages, player_input, reply, model,
              prompt_tokens, completion_tokens, total_tokens,
              cache_hit_tokens, cache_miss_tokens, duration_ms, success, error_msg, created_at
       FROM agent_dialog_call
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      [size, (page - 1) * size],
    );
    return { total, rows: toRows(listRes) };
  }
}

/**
 * 统一抽取 dataSource.query 的结果为数组。
 * TypeORM 的 query 返回结构不稳定（带参数时 [rows,fields]；某些聚合查询返回裸对象/裸数组），
 * 这里兜底处理：剥掉 [rows, fields] 外层 → 保证返回数组。
 */
function toRows(res: any): any[] {
  // 情况1：[rows, fields] —— rows 是数组
  if (Array.isArray(res) && res.length === 2 && Array.isArray(res[0]) && res[1] && typeof res[1] === 'object' && !Array.isArray(res[1])) {
    return res[0];
  }
  // 情况2：直接是行数组
  if (Array.isArray(res)) return res;
  // 情况3：裸单行对象
  if (res && typeof res === 'object') return [res];
  return [];
}
