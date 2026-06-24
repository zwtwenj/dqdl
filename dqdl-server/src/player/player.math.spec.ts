import { getLevelK, calcLevelCultivation, PlayerService } from './player.service';

/**
 * 冻结玩家等级数学：这些纯函数将在阶段 1.5 / 1.2 重构中被搬运，
 * 其输入/输出契约不可变化。锁定的是「当前实际行为」，而非注释文字。
 */
describe('player level math (行为冻结)', () => {
  describe('getLevelK', () => {
    it('level 1-10 返回 100（含 10，因判断为 level>=11）', () => {
      expect(getLevelK(1)).toBe(100);
      expect(getLevelK(9)).toBe(100);
      expect(getLevelK(10)).toBe(100);
    });
    it('level 11-20 返回 200', () => {
      expect(getLevelK(11)).toBe(200);
      expect(getLevelK(20)).toBe(200);
    });
    it('level 21-30 返回 300', () => {
      expect(getLevelK(21)).toBe(300);
      expect(getLevelK(30)).toBe(300);
    });
    it('level>=31 返回 400', () => {
      expect(getLevelK(31)).toBe(400);
      expect(getLevelK(39)).toBe(400);
    });
  });

  describe('calcLevelCultivation = K * level^2', () => {
    it.each<[number, number]>([
      [1, 100],
      [9, 8100],
      [10, 10000],
      [11, 24200],
      [20, 80000],
      [21, 132300],
      [30, 270000],
      [31, 384400],
      [39, 608400],
    ])('level %i -> %i', (level, expected) => {
      expect(calcLevelCultivation(level)).toBe(expected);
    });
  });

  describe('PlayerService.levelName', () => {
    it('斗之气 1-9 段', () => {
      expect(PlayerService.levelName(1)).toBe('斗之气 一段');
      expect(PlayerService.levelName(9)).toBe('斗之气 九段');
    });
    it('斗者 11-19 星', () => {
      expect(PlayerService.levelName(11)).toBe('斗者 一星');
      expect(PlayerService.levelName(19)).toBe('斗者 九星');
    });
    it('斗师 21-29 星', () => {
      expect(PlayerService.levelName(21)).toBe('斗师 一星');
      expect(PlayerService.levelName(29)).toBe('斗师 九星');
    });
    it('大斗师 31-39 星', () => {
      expect(PlayerService.levelName(31)).toBe('大斗师 一星');
      expect(PlayerService.levelName(39)).toBe('大斗师 九星');
    });
  });

  describe('PlayerService.breakthroughRate', () => {
    it('level<11 返回 80', () => {
      expect(PlayerService.breakthroughRate(1)).toBe(80);
      expect(PlayerService.breakthroughRate(10)).toBe(80);
    });
    it('11<=level<21 返回 70', () => {
      expect(PlayerService.breakthroughRate(11)).toBe(70);
      expect(PlayerService.breakthroughRate(20)).toBe(70);
    });
    it('level>=21 返回 60', () => {
      expect(PlayerService.breakthroughRate(21)).toBe(60);
      expect(PlayerService.breakthroughRate(30)).toBe(60);
    });
  });
});
