import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from './player.entity';
import { CreatePlayerDto } from './dto/create-player.dto';
import { TechniqueService } from '../technique/technique.service';

@Injectable()
export class PlayerService {
  constructor(
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    private readonly techniqueService: TechniqueService,
  ) {}

  async create(dto: CreatePlayerDto): Promise<Player> {
    const player = this.playerRepo.create(dto);
    // 公式计算
    player.hp = (player.stamina || 5) * 10;
    player.energy = (player.level || 1) * 20;
    player.buff = '[]';
    player.money = 0;
    player.exp = 0;
    player.cultivation = 0;
    player.technique_id = 1; // 默认焰诀
    return this.playerRepo.save(player);
  }

  async findOne(id: number): Promise<any> {
    const player = await this.playerRepo.findOneBy({ id });
    if (!player) return null;

    // 查功法
    const tech = await this.techniqueService.findOne(player.technique_id);
    const techBase = tech ? this.techniqueService.parseBase(tech.base) : {};

    // 计算最终属性 = 基础 + 功法加成
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

  async update(
    id: number,
    updates: Partial<CreatePlayerDto>,
  ): Promise<Player | null> {
    await this.playerRepo.update(id, updates);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.playerRepo.delete(id);
  }
}
