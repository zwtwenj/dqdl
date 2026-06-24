import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Buff } from './buff.entity';
import { BuffEffect } from './buff-effect.entity';

@Injectable()
export class BuffService {
  constructor(
    @InjectRepository(Buff)
    private readonly buffRepo: Repository<Buff>,
    @InjectRepository(BuffEffect)
    private readonly effectRepo: Repository<BuffEffect>,
  ) {}

  async findAll(): Promise<Buff[]> {
    return this.buffRepo.find({ order: { id: 'ASC' } });
  }

  /** 全部 buff 效果（供战斗引擎加载定义） */
  async findAllEffects(): Promise<BuffEffect[]> {
    return this.effectRepo.find();
  }

  async findOne(id: number): Promise<Buff | null> {
    return this.buffRepo.findOneBy({ id });
  }

  async create(data: Partial<Buff>): Promise<Buff> {
    return this.buffRepo.save(this.buffRepo.create(data));
  }
}
