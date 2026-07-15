import { DataSource } from 'typeorm';
import { Logger } from '@nestjs/common';

/**
 * 对话快捷事件可见性规则库。
 *
 * dialog_event.visible_rule 存本表中的函数名（字符串），NpcService.findOne 返回
 * dialog_events 前对每条事件调 evalVisibleRule 判定是否可见。
 *
 * 规则函数职责：接收玩家上下文，返回「该玩家是否应看到此事件按钮」。
 *   - 返回 true  → 事件保留，前端渲染按钮
 *   - 返回 false → 事件剔除，玩家看不到
 *
 * 设计：规则函数直接用 DataSource 查库（不注入具体 Service），
 *   保持规则库与业务 Service 解耦，避免模块循环依赖。
 *   所有规则都是纯查询，不应有副作用。
 */
const logger = new Logger('DialogVisibleRules');

/** 规则上下文：当前玩家 id + 数据源（查任意表） */
export interface VisibleRuleContext {
  playerId: number;
  dataSource: DataSource;
}

/** 规则注册表：key = visible_rule 字段值，value = 判定函数 */
export const dialogVisibleRules: Record<string, (ctx: VisibleRuleContext) => Promise<boolean>> = {
  /**
   * 玩家有可交付的佣兵任务时才可见（如「交付任务」按钮）。
   * 可交付 = type='adventurer' AND status='pending'，且所有 target.current >= required。
   */
  async hasClaimableTask({ playerId, dataSource }): Promise<boolean> {
    const taskRepo = dataSource.getRepository('task');
    const tasks = await taskRepo.find({
      where: { player_id: playerId, type: 'adventurer', status: 'pending' },
    });
    return tasks.some((t) => {
      const targets = safeParseArr(t.target);
      return targets.length > 0 && targets.every((tg) => (tg.current ?? 0) >= (tg.required ?? 0));
    });
  },
};

/**
 * 求值某条事件的可见性规则。
 * @param rule  dialog_event.visible_rule（空串 = 始终可见）
 * @param ctx   玩家上下文
 * @returns true=可见。规则名为空或未注册（容错）都返回 true，不阻断渲染。
 */
export async function evalVisibleRule(rule: string, ctx: VisibleRuleContext): Promise<boolean> {
  if (!rule) return true;
  const fn = dialogVisibleRules[rule];
  if (!fn) {
    // 未注册的规则名：容错返回可见（避免配置笔误导致按钮永久消失）
    logger.warn(`未知可见性规则「${rule}」，按始终可见处理`);
    return true;
  }
  try {
    return await fn(ctx);
  } catch (e) {
    logger.error(`可见性规则「${rule}」执行异常：${e}，按可见处理`);
    return true;
  }
}

/** 安全 parse JSON TEXT 列为数组 */
function safeParseArr(raw: string | null): any[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}
