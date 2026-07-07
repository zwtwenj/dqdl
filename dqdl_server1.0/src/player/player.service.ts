import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Player } from './player.entity';

/**
 * 玩家服务：每个角色对应一个 player。
 * location_id 指向全局地图（所有角色共享）。
 */
@Injectable()
export class PlayerService {
  constructor(
    @InjectRepository(Player)
    private readonly repo: Repository<Player>,
  ) {}

  /** 为角色创建 player（幂等：已存在则返回） */
  async createForCharacter(characterId: number, name: string, locationId: number): Promise<Player> {
    const existing = await this.repo.findOneBy({ character_id: characterId })
    if (existing) return existing
    return this.repo.save(
      this.repo.create({ character_id: characterId, name, location_id: locationId }),
    )
  }

  /** 查询角色的 player */
  async findByCharacterId(characterId: number): Promise<Player | null> {
    return this.repo.findOneBy({ character_id: characterId })
  }

  /** 删除角色的 player（删角色时级联） */
  async removeByCharacterId(characterId: number): Promise<void> {
    await this.repo.delete({ character_id: characterId })
  }
}
