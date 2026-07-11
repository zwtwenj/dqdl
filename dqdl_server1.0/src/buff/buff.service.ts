import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Buff } from './buff.entity';
import { BuffEffect } from './buff-effect.entity';

/**
 * Buff 服务：供战斗引擎加载定义用。
 * 战斗模块启动时调用 findAll/findAllEffects 把全量定义载入内存单例（loadDefs）。
 */
@Injectable()
export class BuffService {
  constructor(
    @InjectRepository(Buff)
    private readonly buffRepo: Repository<Buff>,
    @InjectRepository(BuffEffect)
    private readonly effectRepo: Repository<BuffEffect>,
  ) {}

  async findAll(): Promise<Buff[]> {
    return this.buffRepo.find();
  }

  async findAllEffects(): Promise<BuffEffect[]> {
    return this.effectRepo.find();
  }

  async findOneByKey(key: string): Promise<Buff | null> {
    return this.buffRepo.findOneBy({ key });
  }
}
