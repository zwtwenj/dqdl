import {
  createCombatant,
  getAttrs,
  loadDefs,
  applyBuff,
  newState,
  runTurn,
} from './battle-engine';
import { Buff } from '../buff/buff.entity';
import { BuffEffect } from '../buff/buff-effect.entity';
import { EventBus } from './battle.types';

/**
 * 冻结战斗引擎核心：createCombatant / getAttrs(passive stat) / applyBuff(叠加规则) /
 * runTurn(伤害公式)。阶段 1.2 会把 BattleService 改为注入 BuffService/SkillService，
 * 引擎本身必须保持等价。
 */
describe('battle-engine (行为冻结)', () => {
  function makeBuff(p: Partial<Buff>): Buff {
    return {
      id: 1, key: 'b', name: 'B', icon: '✦', type: 'buff',
      duration: 3, stack_rule: 'refresh', max_stack: 5, snapshot: false,
      priority: 0, tags: null, description: null, ...p,
    } as Buff;
  }
  function makeEffect(p: Partial<BuffEffect>): BuffEffect {
    return {
      id: 1, buffId: 1, hook: 'passive', fnId: 'stat',
      params: null, priority: 0, consume: false, ...p,
    } as BuffEffect;
  }

  beforeEach(() => {
    loadDefs([], []); // 清空 DEFS 单例，保证用例隔离
  });

  describe('createCombatant', () => {
    it('合并默认属性（crit_rate 默认 20）', () => {
      const c = createCombatant({
        side: 'player', name: 'P', level: 5,
        base: { power: 100 }, hp: 200, maxHp: 200,
      });
      expect(c.base.power).toBe(100);
      expect(c.base.crit_rate).toBe(20);
      expect(c.base.intelligence).toBe(0);
      expect(c.buffs).toEqual([]);
      expect(c.uid).toBeGreaterThan(0);
    });
  });

  describe('getAttrs · passive/stat', () => {
    it('add 操作：累加 value*level*stacks', () => {
      loadDefs(
        [makeBuff({ id: 1, key: 'atk', name: '攻击up' })],
        [makeEffect({
          buffId: 1, hook: 'passive', fnId: 'stat',
          params: JSON.stringify({ attr: 'power', value: 10, op: 'add' }),
        })],
      );
      const c = createCombatant({ side: 'player', name: 'P', level: 5, base: { power: 100 }, hp: 100, maxHp: 100 });
      applyBuff(c, 'atk', c, 2); // level=2, stacks=1
      expect(getAttrs(c).power).toBe(100 + 10 * 2 * 1); // 120
    });

    it('mul 操作：乘算 (1 + value*level*stacks)', () => {
      loadDefs(
        [makeBuff({ id: 2, key: 'pw', name: 'M' })],
        [makeEffect({
          buffId: 2, hook: 'passive', fnId: 'stat',
          params: JSON.stringify({ attr: 'power', value: 0.5, op: 'mul' }),
        })],
      );
      const c = createCombatant({ side: 'player', name: 'P', level: 5, base: { power: 100 }, hp: 100, maxHp: 100 });
      applyBuff(c, 'pw', c, 1);
      expect(getAttrs(c).power).toBe(100 * (1 + 0.5 * 1 * 1)); // 150
    });
  });

  describe('applyBuff 叠加规则', () => {
    it('refresh：刷新持续、取较高等级', () => {
      loadDefs([makeBuff({ id: 1, key: 'r', name: 'R', stack_rule: 'refresh', duration: 3 })], []);
      const c = createCombatant({ side: 'player', name: 'P', level: 1, base: {}, hp: 1, maxHp: 1 });
      applyBuff(c, 'r', c, 1);
      applyBuff(c, 'r', c, 3);
      expect(c.buffs.length).toBe(1);
      expect(c.buffs[0].level).toBe(3);
      expect(c.buffs[0].remaining).toBe(3);
    });

    it('stack：层数累加上限为 max_stack', () => {
      loadDefs([makeBuff({ id: 1, key: 's', name: 'S', stack_rule: 'stack', max_stack: 3, duration: 2 })], []);
      const c = createCombatant({ side: 'player', name: 'P', level: 1, base: {}, hp: 1, maxHp: 1 });
      applyBuff(c, 's', c, 1);
      applyBuff(c, 's', c, 1);
      applyBuff(c, 's', c, 1);
      applyBuff(c, 's', c, 1); // 第四次，应被 clamp 到 3
      expect(c.buffs[0].stacks).toBe(3);
    });
  });

  describe('runTurn', () => {
    it('普通攻击造成确定性伤害并击杀（无暴击：Math.random→0.5）', () => {
      const rnd = jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const p = createCombatant({ side: 'player', name: '勇者', level: 10, base: { power: 500 }, hp: 100, maxHp: 100, skipEnergy: true });
      const m = createCombatant({ side: 'mob', name: '史莱姆', level: 5, base: { stamina: 0 }, hp: 50, maxHp: 50, skipEnergy: true });
      const st = newState(p, m, []);

      runTurn(st, p, m, { type: 'normal' });

      // reduction = (0+800)/((10+20)*100)=0.2667 ; finalDamage=round(500*(1-0.2667))=367
      expect(m.hp).toBe(0);
      expect(st.over).toBe(true);
      expect(st.winner).toBe('player');
      const dmg = st.bus.eventLog.find((e: any) => e.t === 'damage');
      expect(dmg?.amount).toBe(367);
      expect(dmg?.crit).toBe(false);
      rnd.mockRestore();
    });

    it('眩晕状态跳过攻击', () => {
      loadDefs([makeBuff({ id: 1, key: 'stun', name: '眩晕', tags: JSON.stringify(['stun']) })], []);
      const p = createCombatant({ side: 'player', name: '勇者', level: 10, base: { power: 500 }, hp: 100, maxHp: 100 });
      const m = createCombatant({ side: 'mob', name: '史莱姆', level: 5, base: {}, hp: 50, maxHp: 50 });
      applyBuff(p, 'stun', p, 1);
      const st = newState(p, m, []);

      runTurn(st, p, m, { type: 'normal' });

      expect(m.hp).toBe(50); // 未受伤害
      expect(st.over).toBe(false);
      expect(st.log.some((l) => l.includes('被眩晕'))).toBe(true);
    });
  });

  describe('EventBus', () => {
    it('post / drain 按单位与钩子过滤', () => {
      const bus = new EventBus();
      const p = createCombatant({ side: 'player', name: 'P', level: 1, base: {}, hp: 1, maxHp: 1 });
      const m = createCombatant({ side: 'mob', name: 'M', level: 1, base: {}, hp: 1, maxHp: 1 });
      bus.post({ from: p, to: m, hook: 'afterHit', kind: 'deliver' });
      bus.post({ from: p, to: p, hook: 'beforeAttack', kind: 'self' });

      expect(bus.drain(m, 'afterHit').length).toBe(1);
      expect(bus.drain(m, 'afterHit').length).toBe(0); // 已消费
      expect(bus.drain(p, 'beforeAttack').length).toBe(1);
      expect(bus.drain(m, 'beforeAttack').length).toBe(0); // 不匹配单位
    });
  });
});
