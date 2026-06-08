import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Technique } from './technique.entity';

@Injectable()
export class TechniqueService {
  constructor(
    @InjectRepository(Technique)
    private readonly repo: Repository<Technique>,
  ) {}

  async findAll(): Promise<Technique[]> {
    return this.repo.find({ order: { rank: 'ASC' } });
  }

  async findOne(id: number): Promise<Technique | null> {
    return this.repo.findOneBy({ id });
  }

  async create(data: Partial<Technique>): Promise<Technique> {
    return this.repo.save(this.repo.create(data));
  }

  /** 解析 base JSON */
  parseBase(baseJson: string | null): Record<string, number> {
    if (!baseJson) return {};
    try { return JSON.parse(baseJson); } catch { return {}; }
  }
}
