import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Character } from './character.entity';
import { BizException, Biz } from '../common/biz.exception';
import { ResponseCode } from '../common/response-code';

/** 每个账号最多角色数 */
export const MAX_CHARACTERS = 3;

/**
 * 角色服务（网游模式）：管理账号下的角色（最多 3 个）。
 * 一个角色对应一个 player（由 GameService 在创建角色时一并初始化）。
 */
@Injectable()
export class CharacterService {
  constructor(
    @InjectRepository(Character)
    private readonly repo: Repository<Character>,
  ) {}

  /** 列出该账号的所有角色（按 slot 排序） */
  async listByUser(userId: number): Promise<Character[]> {
    return this.repo.find({ where: { user_id: userId }, order: { slot: 'ASC' } })
  }

  /** 获取指定序号的角色 */
  async getBySlot(userId: number, slot: number): Promise<Character | null> {
    return this.repo.findOneBy({ user_id: userId, slot })
  }

  /** 按 id 查单个角色（ownership 校验用） */
  async findOneById(id: number): Promise<Character | null> {
    return this.repo.findOneBy({ id })
  }

  /**
   * 创建角色：自动选第一个空闲序号（1/2/3），超过 3 个拒绝。
   */
  async create(userId: number, name: string): Promise<Character> {
    const existing = await this.repo.find({ where: { user_id: userId } })
    if (existing.length >= MAX_CHARACTERS) {
      throw new BizException(ResponseCode.CHARACTERS_FULL, `角色已满（最多 ${MAX_CHARACTERS} 个），请先删除旧角色`)
    }
    const usedSlots = new Set(existing.map((c) => c.slot))
    const slot = [1, 2, 3].find((s) => !usedSlots.has(s)) ?? 1

    return this.repo.save(
      this.repo.create({ user_id: userId, slot, name }),
    )
  }

  /** 删除角色（player 由 GameService 级联清理） */
  async remove(userId: number, slot: number): Promise<Character | null> {
    const character = await this.getBySlot(userId, slot)
    if (!character) throw Biz.notFound(`角色序号 ${slot} 不存在`)
    await this.repo.remove(character)
    return character
  }
}
