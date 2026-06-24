import { SkillService } from './skill.service';
import { Skill } from './skill.entity';

/** 冻结斗技纯解析/伤害计算。这些逻辑在阶段 1.2 会被 BattleService 复用。 */
describe('SkillService 纯解析/计算 (行为冻结)', () => {
  let svc: SkillService;

  beforeEach(() => {
    svc = new SkillService(undefined as any);
  });

  function makeSkill(p: Partial<Skill>): Skill {
    return {
      id: 1,
      name: '测试技',
      description: null,
      base_damage: 0,
      attr: 'power',
      scaling: '[]',
      levels: null,
      rank: 11,
      level: 1,
      max_level: 5,
      target_effects: null,
      self_effects: null,
      carried: null,
      energy_cost: 10,
      ...p,
    } as Skill;
  }

  describe('parseScaling', () => {
    it('正常 JSON 数组', () => {
      expect(svc.parseScaling('[1.2, 1.4, 1.6]')).toEqual([1.2, 1.4, 1.6]);
    });
    it('null 返回空数组', () => {
      expect(svc.parseScaling(null)).toEqual([]);
    });
    it('非法 JSON 返回空数组', () => {
      expect(svc.parseScaling('not-json')).toEqual([]);
    });
    it('空字符串返回空数组', () => {
      expect(svc.parseScaling('')).toEqual([]);
    });
  });

  describe('parseEffects', () => {
    it('正常 JSON 字符串数组', () => {
      expect(svc.parseEffects('["burn", "bleed"]')).toEqual(['burn', 'bleed']);
    });
    it('null 返回空数组', () => {
      expect(svc.parseEffects(null)).toEqual([]);
    });
    it('非法 JSON 返回空数组', () => {
      expect(svc.parseEffects('{bad')).toEqual([]);
    });
  });

  describe('calcDamage = base_damage + scaling[level-1]*attr ±10%', () => {
    it('取对应等级倍率', () => {
      const sk = makeSkill({ base_damage: 100, scaling: '[1.0, 2.0]', level: 2 });
      // rate = scaling[1] = 2.0 ; base = 100 + round(2.0*50) = 200
      expect(svc.calcDamage(sk, 50)).toEqual({ base: 200, min: 180, max: 220 });
    });

    it('等级超出数组长度时取最后一个倍率', () => {
      const sk = makeSkill({ base_damage: 100, scaling: '[1.0, 2.0]', level: 9 });
      // rate = scaling[8] ?? scaling[last]=2.0 ; base = 100 + round(2.0*50) = 200
      expect(svc.calcDamage(sk, 50).base).toBe(200);
    });

    it('空 scaling 退化为倍率 1', () => {
      const sk = makeSkill({ base_damage: 50, scaling: '[]', level: 1 });
      // rate = scaling[0] ?? scaling[last] ?? 1 = 1 ; base = 50 + round(1*30) = 80
      expect(svc.calcDamage(sk, 30)).toEqual({ base: 80, min: 72, max: 88 });
    });
  });
});
