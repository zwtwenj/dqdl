import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { PlayerService } from '../src/player/player.service';
import { TrainingService } from '../src/training/training.service';
import { BattleService } from '../src/battle/battle.service';
import { calcLevelCultivation } from '../src/player/player.service';
import { Player } from '../src/player/player.entity';
import { Location } from '../src/location/location.entity';
import { Mob } from '../src/mob/mob.entity';
import { Backpack } from '../src/backpack/backpack.entity';
import { Task } from '../src/task/task.entity';

/**
 * 黄金路径集成基线（服务层）：
 * 直接拉取真实服务 + 真实 DB，覆盖跨模块编排——
 *   修炼 → 突破 → 历练(战斗→掉落→任务进度) → 回合制战斗
 * 这些正是阶段 1.2/1.3/1.4 重构将搬运的路径。
 *
 * Agent(DeepSeek) 调用被桩成确定性响应，避免真实 LLM 的耗时/费用/不确定性；
 * 断言只针对「非叙事」的游戏状态契约，因此桩文本不影响。
 */
describe('Golden path 游戏主流程 (集成基线)', () => {
  let app: INestApplication;
  let playerService: PlayerService;
  let trainingService: TrainingService;
  let battleService: BattleService;
  let playerRepo: Repository<Player>;
  let locRepo: Repository<Location>;
  let mobRepo: Repository<Mob>;
  let backpackRepo: Repository<Backpack>;
  let taskRepo: Repository<Task>;

  let testPlayerId: number;
  let wildLocationId: number;
  let testMobId: string;
  let originalFetch: any;

  const STYLES = ['随手斩杀', '轻松获胜', '势均力敌', '艰难苦战', '九死一生', '毫无胜算'];
  const WIN_RATES = [0, 10, 25, 50, 75, 100];
  const UNIQUE = `e2e_base_${Date.now()}`;

  beforeAll(async () => {
    jest.setTimeout(60000);

    // 测试中关闭 schema 自动同步，避免对共享 DB 造成结构变更
    process.env.SYNC = 'false';

    // 桩掉所有出站 Agent LLM 调用 → 确定性、零费用
    originalFetch = (global as any).fetch;
    (global as any).fetch = async (url: string) => ({
      ok: true,
      status: 200,
      json: async () => ({ text: 'TEST_NARRATIVE' }),
    });

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    playerService = app.get(PlayerService);
    trainingService = app.get(TrainingService);
    battleService = app.get(BattleService);
    playerRepo = app.get<Repository<Player>>(getRepositoryToken(Player));
    locRepo = app.get<Repository<Location>>(getRepositoryToken(Location));
    mobRepo = app.get<Repository<Mob>>(getRepositoryToken(Mob));
    backpackRepo = app.get<Repository<Backpack>>(getRepositoryToken(Backpack));
    taskRepo = app.get<Repository<Task>>(getRepositoryToken(Task));

    // 选一个带 common_mobs 的 wild 地点 + 一只 WB- 魔兽
    const wild = await locRepo
      .createQueryBuilder('l')
      .where("l.loc_type = 'wild'")
      .andWhere("l.common_mobs IS NOT NULL")
      .andWhere("l.common_mobs != '[]'")
      .orderBy('l.id', 'ASC')
      .getOne();
    wildLocationId = wild!.id;
    const mob = await mobRepo
      .createQueryBuilder('m')
      .where("m.mob_id LIKE 'WB-%'")
      .orderBy('m.id', 'ASC')
      .getOne();
    testMobId = mob!.mob_id;
  }, 70000);

  afterAll(async () => {
    (global as any).fetch = originalFetch;
    if (testPlayerId) {
      await backpackRepo.delete({ player_id: testPlayerId }).catch(() => void 0);
      await taskRepo.delete({ player_id: testPlayerId }).catch(() => void 0);
      await playerRepo.delete(testPlayerId).catch(() => void 0);
    }
    await app.close();
  });

  it('创建测试玩家', async () => {
    const p = await playerService.create({
      name: UNIQUE,
      level: 1,
      power: 999,
      intelligence: 999,
      quick: 999,
      stamina: 999,
      lucky: 99,
      position: '',
    } as any);
    testPlayerId = p.id;
    expect(p.id).toBeGreaterThan(0);
    expect(p.level_cultivation).toBe(calcLevelCultivation(1));
    expect(p.skill).toBe('[]');
    expect(p.cultivation).toBe(0);
  });

  it('修炼：低斗气不破上限；超高斗气被截断到 level_cultivation', async () => {
    const c1 = await playerService.cultivate(testPlayerId, 10);
    expect(c1.level_cultivation).toBe(100);
    expect(c1.newCultivation).toBeGreaterThanOrEqual(0);
    expect(c1.newCultivation).toBeLessThanOrEqual(100);

    const c2 = await playerService.cultivate(testPlayerId, 1_000_000);
    expect(c2.capped).toBe(true);
    expect(c2.newCultivation).toBe(100);
  });

  it('突破：满足条件后触发，成功升阶或失败修为减半（分支不变量）', async () => {
    const r = await playerService.breakthrough(testPlayerId);
    expect(typeof r.success).toBe('boolean');
    expect(r.levelName).toMatch(/斗之气/);
    if (r.success) {
      expect(r.newLevel).toBe(2);
      expect(r.newCultivation).toBe(0);
      expect(r.gained).toBe(1);
    } else {
      expect(r.newLevel).toBe(1);
      expect(r.newCultivation).toBe(50);
      expect(r.gained).toBe(0);
    }
    // level_cultivation 始终与新等级一致
    expect(r.level_cultivation).toBe(calcLevelCultivation(r.newLevel));
  });

  it('历练 execute：返回完整 TrainingEvent 契约（战斗档位/掉落/任务结构）', async () => {
    const ev = await trainingService.execute(testPlayerId, wildLocationId);
    expect(typeof ev.text).toBe('string');
    expect(ev.text.length).toBeGreaterThan(0);
    expect(typeof ev.mob.mob_id).toBe('string');
    expect(typeof ev.mob.name).toBe('string');
    expect(WIN_RATES).toContain(ev.battle.win_rate);
    expect(STYLES).toContain(ev.battle.style);
    expect(ev.battle.rounds).toBe(1);
    expect(ev.battle.player_total).toBeGreaterThan(0);
    expect(ev.battle.mob_total).toBeGreaterThanOrEqual(0);
    expect(typeof ev.won).toBe('boolean');
    expect(Array.isArray(ev.drops)).toBe(true);
    for (const d of ev.drops) {
      expect(typeof d.item_id).toBe('string');
      expect(typeof d.name).toBe('string');
      expect(d.count).toBeGreaterThan(0);
    }
    expect(Array.isArray(ev.task_updates)).toBe(true);
    expect(typeof ev.timestamp).toBe('string');
  });

  it('回合制战斗：start 创建会话，action 推进并终结算（强玩家必胜）', async () => {
    const snap = await battleService.start(testPlayerId, testMobId);
    expect(snap.player.hp).toBeGreaterThan(0);
    expect(snap.mob.hp).toBeGreaterThan(0);
    expect(snap.over).toBe(false);
    expect(snap.winner).toBeNull();
    expect(Array.isArray(snap.log)).toBe(true);
    expect(Array.isArray(snap.skills)).toBe(true);

    // 推进直到结束（强玩家应 1 回合内击杀）
    let s = snap;
    let guard = 0;
    while (!s.over && guard < 20) {
      s = await battleService.action(testPlayerId, { type: 'normal' });
      guard++;
    }
    expect(s.over).toBe(true);
    expect(s.winner).toBe('player');
    // HP 不变量
    expect(s.player.hp).toBeGreaterThanOrEqual(0);
    expect(s.player.hp).toBeLessThanOrEqual(s.player.maxHp);
    expect(s.mob.hp).toBe(0);
  });
});
