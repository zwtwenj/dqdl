import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from './player.entity';
import { CreatePlayerDto } from './dto/create-player.dto';
import { TechniqueService } from '../technique/technique.service';

/** 等阶 K 常量：1-9=100, 11-19=200, 21-29=300, 31-39=400 */
function getLevelK(level: number): number {
  if (level >= 31) return 400;
  if (level >= 21) return 300;
  if (level >= 11) return 200;
  return 100;
}

/** level_cultivation = K * level^2 */
function calcLevelCultivation(level: number): number {
  return getLevelK(level) * level * level;
}

@Injectable()
export class PlayerService {
  private readonly logger = new Logger(PlayerService.name);

  constructor(
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    private readonly techniqueService: TechniqueService,
  ) {}

  async create(dto: CreatePlayerDto): Promise<Player> {
    const player = this.playerRepo.create(dto);
    player.hp = (player.stamina || 5) * 10;
    player.energy = (player.level || 1) * 20;
    player.buff = '[]';
    player.money = 0;
    player.exp = 0;
    player.cultivation = 0;
    player.extra_attrs = '{}';
    player.level_cultivation = calcLevelCultivation(player.level || 1);
    player.technique_id = 1;
    player.position = dto.position || '';
    player.status = 1;
    return this.playerRepo.save(player);
  }

  async findOne(id: number): Promise<any> {
    const player = await this.playerRepo.findOneBy({ id });
    if (!player) return null;

    const tech = await this.techniqueService.findOne(player.technique_id);
    const techBase = tech ? this.techniqueService.parseBase(tech.base) : {};

    const finalAttrs = {
      power: player.power + (techBase.power || 0),
      intelligence: player.intelligence + (techBase.intelligence || 0),
      quick: player.quick + (techBase.quick || 0),
      stamina: player.stamina + (techBase.stamina || 0),
      lucky: player.lucky + (techBase.lucky || 0),
      energy: player.energy + (techBase.energy || 0),
    };

    return {
      ...player,
      technique: tech ? { ...tech, base: techBase } : null,
      final_attrs: finalAttrs,
    };
  }

  async findAll(): Promise<Player[]> {
    return this.playerRepo.find();
  }

  async update(id: number, updates: Partial<CreatePlayerDto>): Promise<Player | null> {
    await this.playerRepo.update(id, updates);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.playerRepo.delete(id);
  }

  async updatePosition(id: number, position: string): Promise<void> {
    await this.playerRepo.update(id, { position: position as any });
  }

  /** 修炼 */
  async cultivate(id: number, qiDensity: number): Promise<{
    cultivation: number; gained: number; critical: boolean; capped: boolean;
    level_cultivation: number; newCultivation: number;
  }> {
    const player = await this.playerRepo.findOneBy({ id });
    if (!player) throw new Error('玩家不存在');

    const tech = await this.techniqueService.findOne(player.technique_id);
    const growth = tech?.growth ?? 10;
    const lc = player.level_cultivation;

    // 已达上限
    if (player.cultivation >= lc) {
      return { cultivation: player.cultivation, gained: 0, critical: false, capped: true, level_cultivation: lc, newCultivation: player.cultivation };
    }

    const factor = 0.9 + Math.random() * 0.2;
    let gained = Math.round(qiDensity * factor * growth / 100);

    // 暴击：10% 概率三倍
    const critical = Math.random() < 0.1;
    if (critical) gained *= 3;

    // 上限截断
    let newCultivation = player.cultivation + gained;
    const capped = newCultivation > lc;
    if (capped) { gained = lc - player.cultivation; newCultivation = lc; }

    await this.playerRepo.update(id, { cultivation: newCultivation as any });

    this.logger.log(`玩家 ${id} 修炼：+${gained} 修为 (斗气=${qiDensity}, growth=${growth}${critical ? ', 暴击x3' : ''}${capped ? ', 已达上限' : ''})`);
    return { cultivation: player.cultivation, gained, critical, capped, level_cultivation: lc, newCultivation };
  }

  /** 等级名称 */
  static levelName(level: number): string {
    if (level <= 9) return '斗之气 ' + '一二三四五六七八九'[level - 1] + '段';
    if (level <= 19) return '斗者 ' + '一二三四五六七八九'[level - 11] + '星';
    if (level <= 29) return '斗师 ' + '一二三四五六七八九'[level - 21] + '星';
    return '大斗师 ' + '一二三四五六七八九'[level - 31] + '星';
  }

  /** 突破成功率 K% */
  static breakthroughRate(level: number): number {
    if (level >= 21) return 60;
    if (level >= 11) return 70;
    return 80;
  }

  /** 突破 */
  async breakthrough(id: number): Promise<{
    success: boolean; narrative: string; newLevel: number; newCultivation: number;
    level_cultivation: number; levelName: string; oldLevel: number; gained: number;
  }> {
    const player = await this.playerRepo.findOneBy({ id });
    if (!player) throw new Error('玩家不存在');
    const lc = player.level_cultivation;
    if (player.cultivation < lc) throw new Error('修为不足，无法突破');

    const K = PlayerService.breakthroughRate(player.level);
    const success = Math.random() * 100 < K;
    const tech = await this.techniqueService.findOne(player.technique_id);
    const oldLevel = player.level;
    const oldName = PlayerService.levelName(oldLevel);

    let newLevel = player.level;
    let newCultivation = player.cultivation;
    let gained = 0;

    if (success) {
      newLevel = player.level + 1;
      newCultivation = 0;
      gained = 1;
    } else {
      newCultivation = Math.floor(player.cultivation * 0.5);
    }

    const newLc = calcLevelCultivation(newLevel);
    const newName = PlayerService.levelName(newLevel);
    await this.playerRepo.update(id, {
      level: newLevel as any,
      cultivation: newCultivation as any,
      level_cultivation: newLc as any,
    });

    // 调用 agent 生成叙事
    let narrative = '';
    try {
      const agentUrl = process.env['AGENT_URL'] || 'http://localhost:5000';
      const resp = await fetch(agentUrl + '/generate/breakthrough', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player: { name: player.name, level: oldLevel, level_name: success ? newName : oldName, technique_name: tech?.name || '' },
          success,
          location: { name: '' },
        }),
      });
      const data = await resp.json() as any;
      narrative = data?.text || '';
    } catch { narrative = success ? '你感到体内斗气翻涌，成功突破了修炼瓶颈！' : '你冲击瓶颈失败，体内斗气紊乱，修为受损。'; }

    this.logger.log('玩家 ' + id + ' 突破：' + (success ? '成功' : '失败') + ' ' + oldName + ' -> ' + newName);
    return { success, narrative, newLevel, newCultivation, level_cultivation: newLc, levelName: newName, oldLevel, gained };
  }

}
