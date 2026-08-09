import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

/**
 * 事件管理服务。
 *
 * 数据源：story_event 表（dqdl1.0 库，dqdl-writer/adapt_story 写入）。
 *   - list / detail 为只读查询（沿用管理后台「只读浏览」约定）
 *   - generate 是唯一写入口：转发到 dqdl-agent 的 POST /generate/story-event，
 *     agent 内部跑 v5 生成 + 适配入库（该写入是明确需求，仅此一处）。
 */
@Injectable()
export class EventManagementService {
  private readonly logger = new Logger(EventManagementService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly config: ConfigService,
  ) {}

  /** dqdl-agent 地址（.env AGENT_URL，缺省 http://127.0.0.1:5000） */
  private agentUrl(): string {
    return this.config.get('AGENT_URL') || 'http://127.0.0.1:5000';
  }

  /**
   * 事件列表（分页 + 标题/theme 关键词搜索）。
   */
  async list(page = 1, size = 20, keyword?: string): Promise<{ total: number; rows: any[] }> {
    const where = keyword ? `WHERE title LIKE ? OR theme LIKE ? OR story_id LIKE ?` : `WHERE 1=1`;
    const kw = `%${keyword}%`;
    const countRes = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM story_event ${where}`,
      keyword ? [kw, kw, kw] : [],
    );
    const total = Number(toRows(countRes)[0]?.total) || 0;
    const listRes = await this.dataSource.query(
      `SELECT id, story_id, title, theme, endings_count, max_depth, source, status, created_at
       FROM story_event
       ${where}
       ORDER BY created_at DESC
       LIMIT ? OFFSET ?`,
      keyword ? [kw, kw, kw, size, (page - 1) * size] : [size, (page - 1) * size],
    );
    return { total, rows: toRows(listRes) };
  }

  /**
   * 事件详情（含 nodes / trigger_config / connect_configs JSON，供详情页配置回填用）。
   */
  async detail(id: number): Promise<any> {
    const res = await this.dataSource.query(
      `SELECT id, story_id, title, theme, nodes, trigger_config, connect_configs,
              endings_count, max_depth, source, status, created_at
       FROM story_event WHERE id = ?`,
      [id],
    );
    const rows = toRows(res);
    if (!rows.length) return null;
    const row = rows[0];
    // nodes / trigger_config / connect_configs 都是 JSON 列，mysql2 可能返回字符串，统一解析
    ['nodes', 'trigger_config', 'connect_configs'].forEach((key) => {
      if (typeof row[key] === 'string') {
        try { row[key] = JSON.parse(row[key]); } catch { /* 保持原串 */ }
      }
    });
    return row;
  }

  /**
   * 保存事件触发配置（整体覆盖 trigger_config 列；config 传 null 时清空）。
   * @returns 是否更新成功（事件不存在返回 false）
   */
  async saveTriggerConfig(id: number, config: any): Promise<boolean> {
    const res = await this.dataSource.query(
      `UPDATE story_event SET trigger_config = ? WHERE id = ?`,
      [config == null ? null : JSON.stringify(config), id],
    );
    const header = toRows(res)[0];
    return (header?.affectedRows ?? 0) > 0;
  }

  /**
   * 保存某条连线的配置：merge 进 connect_configs（按 "src->tgt" key）。
   * config 传 null 时删除该连线配置。
   * 校验：task.reward 中的 item 奖励需存在于 item 表（不存在则保存失败），
   * 未配置完整的奖励项会被过滤掉。
   * @returns { ok, connect_configs?, msg? }；事件不存在返回 { ok:false, msg:'事件不存在' }
   */
  async saveConnectConfig(
    id: number,
    edge: string,
    config: any,
  ): Promise<{ ok: boolean; connect_configs?: any; msg?: string }> {
    const res = await this.dataSource.query(
      `SELECT connect_configs FROM story_event WHERE id = ?`,
      [id],
    );
    const rows = toRows(res);
    if (!rows.length) return { ok: false, msg: '事件不存在' };

    // 任务目标校验：丢弃未配置完整的目标项（type 为空），避免脏数据落库/运行时解析异常
    const targets: any[] = (config?.task?.target || []).filter((t) => t && t.type);
    if (config?.task) config.task.target = targets;

    // 任务奖励校验：只保留已配置的奖励项（没选类型或缺少必要字段的丢弃），
    // item 奖励必须存在于 item 表（item_id 是全局唯一ID，前端手输），
    // 校验通过则自动回填物品名（item_name 供任务展示用）。
    const rewards: any[] = (config?.task?.reward || []).filter(
      (r) => r && (r.type === 'money' || (r.type === 'item' && r.item_id)),
    );
    for (const r of rewards) {
      if (r?.type === 'item' && r?.item_id) {
        const items = toRows(
          await this.dataSource.query(
            `SELECT item_id, name FROM item WHERE item_id = ?`,
            [r.item_id],
          ),
        );
        const item = items[0];
        if (!item) return { ok: false, msg: `任务奖励物品不存在：${r.item_id}` };
        r.item_name = item.name; // 自动回填物品名
      }
    }
    if (config?.task) config.task.reward = rewards;

    const cfgs: any = {};
    const raw = rows[0].connect_configs;
    if (raw) {
      try {
        Object.assign(cfgs, typeof raw === 'string' ? JSON.parse(raw) : raw);
      } catch { /* 坏数据忽略，按空配置继续 */ }
    }
    if (config == null) delete cfgs[edge];
    else cfgs[edge] = config;
    await this.dataSource.query(
      `UPDATE story_event SET connect_configs = ? WHERE id = ?`,
      [JSON.stringify(cfgs), id],
    );
    return { ok: true, connect_configs: cfgs };
  }

  /**
   * 生成新事件：转发到 dqdl-agent 的 /generate/story-event。
   * agent 内部跑 dqdl_writer/main.py（v5 生成）+ adapt_story.py（适配入库）。
   * @returns { ok, story_id?, title?, event_id?, msg? }
   */
  async generate(prompt?: string): Promise<any> {
    const url = `${this.agentUrl()}/generate/story-event`;
    this.logger.log(`转发事件生成 → ${url}`);
    try {
      const resp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt || undefined }),
        signal: AbortSignal.timeout(600_000), // agent 生成可能耗时较长
      });
      const data: any = await resp.json();
      if (!resp.ok || data?.ok === false) {
        return { ok: false, msg: data?.msg || `生成失败（HTTP ${resp.status}）` };
      }
      return { ok: true, story_id: data.story_id, title: data.title, event_id: data.event_id };
    } catch (e: any) {
      const msg = e?.name === 'TimeoutError'
        ? '生成超时（agent 长时间未返回）'
        : `调用 agent 失败: ${e?.message || e}`;
      this.logger.error(msg);
      return { ok: false, msg };
    }
  }
}

/** 统一抽取 dataSource.query 的结果为数组（与 agent-log 模块一致）。 */
function toRows(res: any): any[] {
  if (Array.isArray(res) && res.length === 2 && Array.isArray(res[0]) && res[1] && typeof res[1] === 'object' && !Array.isArray(res[1])) {
    return res[0];
  }
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') return [res];
  return [];
}
