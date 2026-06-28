import { Ctx, ActiveBuff, Attrs } from './battle.types';
import { getAttrs, applyBuff, getBuffDef } from './battle-engine';

type BuffFn = (ctx: Ctx, params: any, ab: ActiveBuff | null) => void;

function defOf(key: string) {
  return getBuffDef(key);
}

// fn_id → 处理函数。所有可被 buff_effect.fn_id 引用的逻辑都在这里（受信任代码）。
// stat 类不在此处：getAttrs 直接扫描 hook='passive'/fn_id='stat' 生效。
export const buffLibrary: Record<string, BuffFn> = {
  dot: (ctx, p, ab) => {
    const snap: Attrs = ab?.snapshot || (ab ? getAttrs(ab.source) : ({} as Attrs));
    const ratio = p.ratio ?? 0;
    const dmg = Math.round(((snap[p.scale] || 0) * ratio + (p.flat || 0)) * (ab?.stacks || 1) * (ab?.level || 1));
    const before = ctx.self.hp;
    ctx.self.hp = Math.max(0, ctx.self.hp - dmg);
    const d = defOf(ab?.key || '');
    ctx.log.push(`${d?.icon || '✦'} ${ctx.self.name} 受${d?.name || '持续伤害'}损失 ${before - ctx.self.hp}`);
  },

  damage_mul: (ctx, p) => {
    if (ctx.atk) ctx.atk.damageMul *= 1 + (p.value || 0);
  },

  dodge: (ctx, p) => {
    if (ctx.atk && Math.random() < (p.prob || 0)) {
      ctx.atk.canceled = true;
      ctx.log.push(`👻 ${ctx.self.name} 闪避！`);
    }
  },

  reflect: (ctx, p) => {
    if (!ctx.atk) return;
    const dmg = Math.round((ctx.atk.finalDamage || 0) * (p.value || 0));
    if (dmg > 0 && ctx.atk.source.hp > 0) {
      ctx.atk.source.hp = Math.max(0, ctx.atk.source.hp - dmg);
      ctx.log.push(`🌵 ${ctx.self.name} 反伤 ${ctx.atk.source.name} ${dmg}`);
    }
  },

  lifesteal: (ctx, p) => {
    if (!ctx.atk) return;
    const heal = Math.round((ctx.atk.finalDamage || 0) * (p.value || 0));
    if (heal > 0) {
      ctx.self.hp = Math.min(ctx.self.maxHp, ctx.self.hp + heal);
      ctx.log.push(`🦇 ${ctx.self.name} 吸血恢复 ${heal}`);
    }
  },

  // 携带型：攻击方在 beforeAttack 按属性×倍率计算护甲穿透(快照)，防御方 beforeHit 由信封 resolve 应用到本击
  post_carry: (ctx, p) => {
    const attrVal = getAttrs(ctx.source)[p.scale] || 0;
    const ratio = p.ratio || 0;
    const maxPen = (p.maxPen ?? 0.75) as number;
    const pen = Math.min(maxPen, (attrVal * ratio) / 100);
    ctx.bus.post({
      from: ctx.source, to: ctx.target, hook: p.at, kind: p.kind || 'carry', value: pen,
      resolve: (c) => {
        if (c.atk) {
          c.atk.armorPen = Math.max(c.atk.armorPen || 0, pen);
          c.log.push(`${p.icon || '⚔'} ${p.label || '破甲'}生效 ${Math.round(pen * 100)}% 护甲穿透（${p.scale}×${ratio}）`);
        }
      },
    });
  },

  // 技能投递：beforeAttack 投信，命中后(afterHit)给目标挂 buff（快照此刻冻结）；可用 ratio 覆盖 DoT 强度
  deliver: (ctx, p) => {
    const key = p.buffKey as string;
    const level = p.level ?? 1;
    const snap = getAttrs(ctx.source);
    const override = p.ratio != null ? { ratio: p.ratio } : undefined;
    ctx.bus.post({
      from: ctx.source, to: ctx.target, hook: 'afterHit', kind: 'deliver', value: 0, snapshot: snap,
      resolve: (c) => {
        const d = defOf(key);
        applyBuff(c.target, key, c.source, level, snap, override);
        c.log.push(`${d?.icon || '✦'} ${c.target.name} 被附加「${d?.name || key}」`);
      },
    });
  },

  // 技能自身挂 buff（支持透传参数覆盖，如护盾量 amount）
  apply_self: (ctx, p) => {
    const key = p.buffKey as string;
    const level = p.level ?? 1;
    const d = defOf(key);
    const override = p.amount != null ? { amount: p.amount } : undefined;
    applyBuff(ctx.source, key, ctx.source, level, undefined, override);
    const extra = override ? `（${override.amount}）` : '';
    ctx.log.push(`${d?.icon || '✦'} ${ctx.source.name} 获得「${d?.name || key}」${extra}`);
  },
};
