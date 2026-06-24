import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, DeepPartial } from 'typeorm';
import { Buff } from '../buff/buff.entity';
import { BuffEffect } from '../buff/buff-effect.entity';
import { Skill } from '../skill/skill.entity';
import { PlayerService } from '../player/player.service';
import { loadDefs } from './battle-engine';
import { SkillEffectEntry } from './battle.types';

/**
 * 战斗系统的种子/维护工具：清空并重建 buff / buff_effect / skill 实验数据，
 * 以及给全体玩家重置默认斗技。
 *
 * 从原 BattleService 中抽出（阶段 1.5）：BattleService 只保留运行时回合调度，
 * DDL 与种子常量等"管理员工具"职责独立于此。低层 Repository 访问在此处是合理的。
 */
@Injectable()
export class BattleSeeder {
  private readonly logger = new Logger(BattleSeeder.name);

  constructor(
    @InjectRepository(Buff) private readonly buffRepo: Repository<Buff>,
    @InjectRepository(BuffEffect) private readonly effectRepo: Repository<BuffEffect>,
    @InjectRepository(Skill) private readonly skillRepo: Repository<Skill>,
    private readonly dataSource: DataSource,
    private readonly playerService: PlayerService,
  ) {}

  async seed(): Promise<{ buffs: number; effects: number; skills: number }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await this.dropColumnIfExists(queryRunner, 'buff', ['effect_type', 'scope', 'effect_field', 'base_effect', 'max_level']);
      for (const t of ['buff', 'buff_effect', 'skill']) {
        await queryRunner.query(`ALTER TABLE \`${t}\` CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`).catch(() => void 0);
      }

      await this.buffRepo.clear();
      await this.effectRepo.clear();
      await this.skillRepo.clear();

      const buffRows: DeepPartial<Buff>[] = SEED_BUFFS.map((b) => ({
        key: b.key, name: b.name, icon: b.icon, type: b.type,
        duration: b.duration, stack_rule: b.stack_rule, max_stack: b.max_stack,
        snapshot: b.snapshot, priority: b.priority,
        tags: b.tags ? JSON.stringify(b.tags) : null,
        description: b.description ?? null,
      }));
      const savedBuffs = (await this.buffRepo.save(buffRows)) as Buff[];

      const effectRows: DeepPartial<BuffEffect>[] = [];
      for (const row of SEED_EFFECTS) {
        const buffEntity = savedBuffs.find((b) => b.key === row.key);
        if (!buffEntity) continue;
        effectRows.push({
          buffId: buffEntity.id, hook: row.hook, fnId: row.fnId,
          params: JSON.stringify(row.params ?? {}),
          priority: row.priority ?? 0, consume: !!row.consume,
        });
      }
      const savedEffects = (await this.effectRepo.save(effectRows)) as BuffEffect[];

      const skillRows: DeepPartial<Skill>[] = SEED_SKILLS.map((s) => ({
        name: s.name, description: s.description, base_damage: s.base_damage,
        attr: s.attr, rank: s.rank, level: 1, max_level: s.max_level, energy_cost: s.energy_cost,
        scaling: JSON.stringify(s.levels.map((l) => l.params['伤害倍率'] ?? 1)),
        levels: JSON.stringify(s.levels),
        target_effects: JSON.stringify(s.target_effects || []),
        self_effects: JSON.stringify(s.self_effects || []),
        carried: JSON.stringify(s.carried || []),
      }));
      const savedSkills = (await this.skillRepo.save(skillRows)) as Skill[];

      loadDefs(savedBuffs, savedEffects);
      return { buffs: savedBuffs.length, effects: savedEffects.length, skills: savedSkills.length };
    } finally {
      await queryRunner.release();
    }
  }

  /** 给所有玩家重置默认 5 斗技（按 skill.id 升序取前 5） */
  async equipAllDefaults(): Promise<{ updated: number; skills: number[] }> {
    const players = await this.playerService.findAll();
    const skills = await this.skillRepo.find({ order: { id: 'ASC' }, take: 5 });
    const ids = skills.map((s) => s.id);
    const defaultSkillJson = JSON.stringify(skills.map((s, i) => ({ id: s.id, level: 1, carry: i + 1 })));
    for (const p of players) {
      await this.playerService.patch(p.id, { skill: defaultSkillJson });
    }
    return { updated: players.length, skills: ids };
  }

  private async dropColumnIfExists(qr: any, table: string, columns: string[]) {
    for (const col of columns) {
      const res = await qr.query(
        `SELECT COUNT(*) AS c FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
        [table, col],
      );
      if (Number(res?.[0]?.c || 0) > 0) {
        await qr.query(`ALTER TABLE \`${table}\` DROP COLUMN \`${col}\``);
      }
    }
  }
}

interface SeedBuff {
  key: string; name: string; icon: string; type: string; duration: number;
  stack_rule: string; max_stack: number; snapshot: boolean; priority: number; tags?: string[]; description?: string;
}
interface SeedEffect { key: string; hook: string; fnId: string; params?: any; priority?: number; consume?: boolean }
interface SeedSkill {
  name: string; description: string; base_damage: number; attr: string;
  rank: number; max_level: number; energy_cost: number;
  levels: { level: number; params: Record<string, number> }[];
  target_effects?: SkillEffectEntry[]; self_effects?: SkillEffectEntry[]; carried?: SkillEffectEntry[];
}

function lv(dmg: number[], extra: Record<string, number[]> = {}) {
  return dmg.map((d, i) => {
    const params: Record<string, number> = { '伤害倍率': d };
    for (const k of Object.keys(extra)) params[k] = extra[k][i];
    return { level: i + 1, params };
  });
}

const SEED_BUFFS: SeedBuff[] = [
  { key: 'bleed', name: '撕裂', icon: '🩸', type: 'dot', duration: 3, stack_rule: 'refresh', max_stack: 1, snapshot: true, priority: 0, description: '受者每回合损失生命，按施法者力量结算' },
  { key: 'burn', name: '灼烧', icon: '🔥', type: 'dot', duration: 3, stack_rule: 'refresh', max_stack: 1, snapshot: true, priority: 0, description: '每回合灼烧伤害，按施法者智力结算' },
  { key: 'trauma', name: '内伤', icon: '💢', type: 'dot', duration: 4, stack_rule: 'stack', max_stack: 3, snapshot: true, priority: 0, description: '可叠层的内伤，每层加深伤害' },
  { key: 'weak', name: '虚弱', icon: '🥀', type: 'debuff', duration: 3, stack_rule: 'refresh', max_stack: 1, snapshot: false, priority: 0, description: '力量-25%' },
  { key: 'slow', name: '减速', icon: '🐌', type: 'debuff', duration: 3, stack_rule: 'refresh', max_stack: 1, snapshot: false, priority: 0, description: '敏捷-25%' },
  { key: 'stun', name: '眩晕', icon: '💫', type: 'status', duration: 1, stack_rule: 'refresh', max_stack: 1, snapshot: false, priority: 0, tags: ['stun'], description: '跳过下一回合' },
  { key: 'power_surge', name: '刚猛', icon: '💪', type: 'buff', duration: 3, stack_rule: 'refresh', max_stack: 1, snapshot: false, priority: 0, description: '力量+30%' },
  { key: 'shield', name: '护盾', icon: '🛡', type: 'buff', duration: 3, stack_rule: 'refresh', max_stack: 1, snapshot: false, priority: 0, description: '受击伤害-40%' },
  { key: 'evasion', name: '闪避', icon: '👻', type: 'buff', duration: 3, stack_rule: 'refresh', max_stack: 1, snapshot: false, priority: 0, description: '受击时40%概率闪避' },
  { key: 'vampire', name: '吸血', icon: '🦇', type: 'buff', duration: 5, stack_rule: 'refresh', max_stack: 1, snapshot: false, priority: 0, description: '造成伤害时吸取12%' },
  { key: 'thorns', name: '荆棘', icon: '🌵', type: 'buff', duration: 5, stack_rule: 'refresh', max_stack: 1, snapshot: false, priority: 0, description: '受击时反伤25%' },
  { key: 'pojia', name: '破甲', icon: '⚔', type: 'buff', duration: 3, stack_rule: 'refresh', max_stack: 1, snapshot: false, priority: 0, description: '攻击携带破甲，按力量无视减伤(携带型两段式)' },
];

const SEED_EFFECTS: SeedEffect[] = [
  { key: 'bleed', hook: 'onTurnStart', fnId: 'dot', params: { scale: 'power', ratio: 2 } },
  { key: 'burn', hook: 'onTurnStart', fnId: 'dot', params: { scale: 'intelligence', ratio: 0.5, flat: 4 } },
  { key: 'trauma', hook: 'onTurnStart', fnId: 'dot', params: { scale: 'power', ratio: 0.3, flat: 6 } },
  { key: 'weak', hook: 'passive', fnId: 'stat', params: { attr: 'power', op: 'mul', value: -0.25 } },
  { key: 'slow', hook: 'passive', fnId: 'stat', params: { attr: 'quick', op: 'mul', value: -0.25 } },
  { key: 'power_surge', hook: 'passive', fnId: 'stat', params: { attr: 'power', op: 'mul', value: 0.3 } },
  { key: 'shield', hook: 'beforeHit', fnId: 'damage_mul', params: { value: -0.4 }, priority: 5 },
  { key: 'evasion', hook: 'beforeHit', fnId: 'dodge', params: { prob: 0.4 }, priority: 1 },
  { key: 'vampire', hook: 'afterAttack', fnId: 'lifesteal', params: { value: 0.12 } },
  { key: 'thorns', hook: 'afterHit', fnId: 'reflect', params: { value: 0.25 } },
  { key: 'pojia', hook: 'beforeAttack', fnId: 'post_carry', params: { at: 'beforeHit', kind: 'armorPen', scale: 'power', ratio: 0.5, maxPen: 0.75, icon: '⚔', label: '破甲' }, priority: 10 },
];

const SEED_SKILLS: SeedSkill[] = [
  { name: '八极崩', description: '玄阶中级斗技，近身强攻，暗含八重劲气，携带破甲', base_damage: 10, attr: 'power', rank: 32, max_level: 5, energy_cost: 15,
    levels: lv([1.2, 1.4, 1.6, 1.8, 2.0], { '破甲倍率': [0.30, 0.32, 0.34, 0.36, 0.38] }),
    carried: [{ buff: 'pojia', paramKey: '破甲倍率' }], target_effects: [{ buff: 'trauma' }, { buff: 'weak' }], self_effects: [{ buff: 'power_surge' }] },
  { name: '焰分噬浪尺', description: '地阶低级斗技，以玄重尺凝聚火焰，高倍率破甲', base_damage: 15, attr: 'power', rank: 21, max_level: 5, energy_cost: 20,
    levels: lv([1.4, 1.6, 1.9, 2.2, 2.5], { '破甲倍率': [0.40, 0.42, 0.44, 0.46, 0.48], '灼烧倍率': [1.0, 1.1, 1.2, 1.3, 1.4] }),
    carried: [{ buff: 'pojia', paramKey: '破甲倍率' }], target_effects: [{ buff: 'burn', paramKey: '灼烧倍率' }], self_effects: [{ buff: 'power_surge' }] },
  { name: '三千雷动', description: '地阶低级身法，身形如电，附闪避', base_damage: 5, attr: 'quick', rank: 21, max_level: 5, energy_cost: 15,
    levels: lv([1.0, 1.2, 1.5, 1.8, 2.2]),
    target_effects: [{ buff: 'stun' }], self_effects: [{ buff: 'evasion' }, { buff: 'power_surge' }] },
  { name: '吸掌', description: '玄阶低级斗技，狂猛吸力牵扯', base_damage: 8, attr: 'intelligence', rank: 33, max_level: 5, energy_cost: 12,
    levels: lv([1.0, 1.3, 1.5, 1.8, 2.0]), target_effects: [{ buff: 'slow' }] },
  { name: '吹火诀', description: '玄阶低级斗技，双掌引风助火', base_damage: 8, attr: 'intelligence', rank: 33, max_level: 5, energy_cost: 12,
    levels: lv([1.0, 1.2, 1.4, 1.7, 2.0]), self_effects: [{ buff: 'power_surge' }] },
  { name: '狮虎碎金吟', description: '玄阶高级声波斗技，直击灵魂', base_damage: 12, attr: 'intelligence', rank: 31, max_level: 5, energy_cost: 18,
    levels: lv([1.2, 1.5, 1.7, 2.0, 2.3]), target_effects: [{ buff: 'stun' }, { buff: 'weak' }] },
  { name: '玄冰龙翔', description: '玄阶高级斗技，冰龙冻结万物', base_damage: 12, attr: 'intelligence', rank: 31, max_level: 5, energy_cost: 18,
    levels: lv([1.3, 1.5, 1.8, 2.1, 2.4]), target_effects: [{ buff: 'stun' }, { buff: 'slow' }], self_effects: [{ buff: 'shield' }] },
  { name: '风卷尘生', description: '黄阶高级斗技，狂暴龙卷撕裂', base_damage: 6, attr: 'quick', rank: 41, max_level: 5, energy_cost: 12,
    levels: lv([0.9, 1.1, 1.4, 1.6, 1.9], { '流血倍率': [1.0, 1.2, 1.4, 1.6, 1.8] }),
    target_effects: [{ buff: 'bleed', paramKey: '流血倍率' }], self_effects: [{ buff: 'power_surge' }] },
  { name: '铁山靠', description: '黄阶中级斗技，土属性近身，附石化皮肤', base_damage: 8, attr: 'stamina', rank: 42, max_level: 5, energy_cost: 14,
    levels: lv([1.0, 1.2, 1.5, 1.7, 2.0]), target_effects: [{ buff: 'stun' }], self_effects: [{ buff: 'shield' }] },
  { name: '水龙吟', description: '黄阶中级斗技，水龙旋转冲击', base_damage: 7, attr: 'intelligence', rank: 42, max_level: 5, energy_cost: 12,
    levels: lv([1.0, 1.2, 1.4, 1.7, 1.9]), self_effects: [{ buff: 'shield' }] },
  { name: '火云掌', description: '黄阶高级斗技，火云蔽日', base_damage: 8, attr: 'power', rank: 41, max_level: 5, energy_cost: 14,
    levels: lv([1.1, 1.3, 1.5, 1.8, 2.1], { '灼烧倍率': [1.0, 1.1, 1.2, 1.3, 1.4] }),
    target_effects: [{ buff: 'burn', paramKey: '灼烧倍率' }], self_effects: [{ buff: 'power_surge' }] },
  { name: '雷霆一击', description: '黄阶高级斗技，雷霆万钧，携带破甲', base_damage: 9, attr: 'power', rank: 41, max_level: 5, energy_cost: 16,
    levels: lv([1.1, 1.3, 1.6, 1.9, 2.2], { '破甲倍率': [0.35, 0.37, 0.39, 0.41, 0.43] }),
    carried: [{ buff: 'pojia', paramKey: '破甲倍率' }], target_effects: [{ buff: 'stun' }], self_effects: [{ buff: 'shield' }] },
];
