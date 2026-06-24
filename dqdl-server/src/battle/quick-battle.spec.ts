import { classifyQuickBattle, BattleService } from './battle.service';

/**
 * 冻结「快速战斗」胜率档表与 resolveQuickBattle 契约。
 * classifyQuickBattle 源自原 training.service.ts 内联阶梯（阶段 1.2 搬入 battle），
 * training 现统一调用 BattleService.resolveQuickBattle，二者分支必须 1:1。
 */
describe('quick battle (行为冻结)', () => {
  describe('classifyQuickBattle 胜率档表', () => {
    const cases: Array<{ pt: number; mt: number; winRate: number; style: string }> = [
      { pt: 100, mt: 0, winRate: 100, style: '随手斩杀' },
      { pt: 100, mt: 49, winRate: 100, style: '随手斩杀' },
      { pt: 100, mt: 50, winRate: 75, style: '轻松获胜' },
      { pt: 100, mt: 79, winRate: 75, style: '轻松获胜' },
      { pt: 100, mt: 80, winRate: 50, style: '势均力敌' },
      { pt: 100, mt: 99, winRate: 50, style: '势均力敌' },
      { pt: 100, mt: 100, winRate: 25, style: '艰难苦战' },
      { pt: 100, mt: 149, winRate: 25, style: '艰难苦战' },
      { pt: 100, mt: 150, winRate: 10, style: '九死一生' },
      { pt: 100, mt: 200, winRate: 10, style: '九死一生' },
      { pt: 100, mt: 201, winRate: 0, style: '毫无胜算' },
    ];

    for (const c of cases) {
      it(`playerTotal=${c.pt} mobTotal=${c.mt} -> winRate=${c.winRate} (${c.style})`, () => {
        const r = classifyQuickBattle(c.pt, c.mt);
        expect(r.winRate).toBe(c.winRate);
        expect(r.style).toBe(c.style);
      });
    }

    it('playerTotal=0 且 mobTotal>0 -> ratio=Infinity -> 毫无胜算', () => {
      const r = classifyQuickBattle(0, 100);
      expect(r.ratio).toBe(Infinity);
      expect(r.winRate).toBe(0);
    });

    it('双方都为 0 -> ratio=0 -> 随手斩杀', () => {
      const r = classifyQuickBattle(0, 0);
      expect(r.ratio).toBe(0);
      expect(r.winRate).toBe(100);
    });
  });

  describe('BattleService.resolveQuickBattle', () => {
    function makeService() {
      // resolveQuickBattle 不触碰任何依赖，可安全传 undefined
      return new BattleService(
        undefined as any, undefined as any, undefined as any, undefined as any,
      );
    }

    it('返回完整契约，胜率档与 classifyQuickBattle 一致（必胜档）', () => {
      const rnd = jest.spyOn(Math, 'random').mockReturnValue(0.5); // 50 < 100 -> won
      const svc = makeService();
      const player = { power: 1000, intelligence: 0, quick: 0, stamina: 0 };
      const mob = { power: 100, intelligence: 0, quick: 0, stamina: 0 };

      const r = svc.resolveQuickBattle(player, mob);

      expect(r.winRate).toBe(100);
      expect(r.style).toBe('随手斩杀');
      expect(r.won).toBe(true);
      expect(r.playerTotal).toBe(1000);
      expect(r.mobTotal).toBe(100);
      expect(r.rounds).toBe(1);
      rnd.mockRestore();
    });

    it('毫无胜算档 -> won=false', () => {
      const rnd = jest.spyOn(Math, 'random').mockReturnValue(0.5); // 50 < 0 false
      const svc = makeService();
      const player = { power: 100, intelligence: 0, quick: 0, stamina: 0 };
      const mob = { power: 1000, intelligence: 0, quick: 0, stamina: 0 };

      const r = svc.resolveQuickBattle(player, mob);

      expect(r.winRate).toBe(0);
      expect(r.style).toBe('毫无胜算');
      expect(r.won).toBe(false);
      expect(r.playerTotal).toBe(100);
      expect(r.mobTotal).toBe(1000);
      rnd.mockRestore();
    });

    it('优先使用 final_attrs 计算玩家总属性', () => {
      const rnd = jest.spyOn(Math, 'random').mockReturnValue(0.5);
      const svc = makeService();
      const player = { power: 1, intelligence: 1, quick: 1, stamina: 1, final_attrs: { power: 500, intelligence: 0, quick: 0, stamina: 0 } };
      const mob = { power: 10, intelligence: 0, quick: 0, stamina: 0 };

      const r = svc.resolveQuickBattle(player, mob);

      expect(r.playerTotal).toBe(500); // 用 final_attrs 而非裸 power
      rnd.mockRestore();
    });
  });
});
