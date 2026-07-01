/**
 * 物品使用效果库（数据驱动）
 * 即时类(instant)效果在此实现为受信任函数，DB 的 item.use_effect 只存 fn + params。
 * 战斗buff类(buff)复用 buff/buff_effect 引擎，这里只负责把它登记为"待生效战斗增益"。
 */

export interface ItemEffectDescriptor {
  type: 'instant' | 'buff';
  /** 即时类：指向 instantLibrary 的函数 id */
  fn?: string;
  params?: Record<string, any>;
  /** buff 类：buff 表的 key */
  buff?: string;
  /** buff 类：生效范围，如 next_battle */
  scope?: string;
}

export interface ItemUseResult {
  ok: boolean;
  message: string;
  /** 需要写回 player 的列 */
  patch?: Record<string, any>;
  /** 需登记的待生效战斗 buff */
  pendingBuff?: { buff: string; scope: string };
}

interface RawPlayer {
  hp: number;
  max_hp: number;
  energy: number;
  max_energy: number;
  [k: string]: any;
}

type InstantFn = (player: RawPlayer, params: Record<string, any>) => { patch: Record<string, any>; message: string };

// fn_id → 即时效果处理函数（受信任代码）
export const instantLibrary: Record<string, InstantFn> = {
  heal_hp: (p, params) => {
    const amount = Number(params.amount) || 0;
    const before = p.hp;
    const hp = Math.min(p.max_hp, before + amount);
    return { patch: { hp }, message: `生命恢复 ${hp - before}` };
  },
  restore_energy: (p, params) => {
    const amount = Number(params.amount) || 0;
    const before = p.energy;
    const energy = Math.min(p.max_energy, before + amount);
    return { patch: { energy }, message: `斗气恢复 ${energy - before}` };
  },
  gain_cultivation: (p, params) => {
    const amount = Number(params.amount) || 0;
    const cap = Number(p.level_cultivation) || 0;
    const before = Number(p.cultivation) || 0;
    const cultivation = cap > 0 ? Math.min(cap, before + amount) : before + amount;
    return { patch: { cultivation }, message: `修为增加 ${cultivation - before}` };
  },
  add_breakthrough_bonus: (p, params) => {
    const amount = Number(params.amount) || 0;
    const before = Number(p.breakthrough_bonus) || 0;
    return { patch: { breakthrough_bonus: before + amount }, message: `下次突破成功率 +${amount}%` };
  },
};

/** 解析并结算一个使用效果描述符（不直接写库，只返回要应用的变更） */
export function resolveUseEffect(player: RawPlayer, desc: ItemEffectDescriptor | null | undefined): ItemUseResult {
  if (!desc || typeof desc !== 'object') return { ok: false, message: '无效的效果描述' };

  if (desc.type === 'instant') {
    const fn = desc.fn ? instantLibrary[desc.fn] : null;
    if (!fn) return { ok: false, message: `未知即时效果: ${desc.fn}` };
    const r = fn(player, desc.params || {});
    return { ok: true, message: r.message, patch: r.patch };
  }

  if (desc.type === 'buff') {
    if (!desc.buff) return { ok: false, message: '缺少 buff 键' };
    return { ok: true, message: '获得战斗增益', pendingBuff: { buff: desc.buff, scope: desc.scope || 'next_battle' } };
  }

  return { ok: false, message: `未知效果类型: ${(desc as any).type}` };
}
