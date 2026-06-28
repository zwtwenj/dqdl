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
});
