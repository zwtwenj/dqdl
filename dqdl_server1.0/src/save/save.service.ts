import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Save } from './save.entity';

/** 每个账号最多存档数 */
export const MAX_SAVES = 3;

@Injectable()
export class SaveService {
  constructor(
    @InjectRepository(Save)
    private readonly saveRepo: Repository<Save>,
  ) {}

  /** 列出该账号的所有存档（按 slot 排序） */
  async listByUser(userId: number): Promise<Save[]> {
    return this.saveRepo.find({
      where: { user_id: userId },
      order: { slot: 'ASC' },
    });
  }

  /** 获取指定槽位的存档 */
  async getBySlot(userId: number, slot: number): Promise<Save | null> {
    return this.saveRepo.findOneBy({ user_id: userId, slot });
  }

  /**
   * 创建存档：自动选第一个空闲槽位（1/2/3）。
   * 超过 3 个存档拒绝。
   */
  async create(userId: number, name?: string, content: Record<string, any> = {}): Promise<Save> {
    const existing = await this.saveRepo.find({ where: { user_id: userId } });
    if (existing.length >= MAX_SAVES) {
      throw new BadRequestException(`存档已满（最多 ${MAX_SAVES} 个），请先删除旧存档`);
    }
    const usedSlots = new Set(existing.map((s) => s.slot));
    const slot = [1, 2, 3].find((s) => !usedSlots.has(s)) ?? 1;

    return this.saveRepo.save(
      this.saveRepo.create({ user_id: userId, slot, name: name ?? `存档${slot}`, content }),
    );
  }

  /** 更新存档内容（存游戏进度） */
  async updateContent(userId: number, slot: number, content: Record<string, any>): Promise<Save> {
    const save = await this.getBySlot(userId, slot);
    if (!save) throw new NotFoundException(`存档槽位 ${slot} 不存在`);
    save.content = content;
    return this.saveRepo.save(save);
  }

  /** 重命名存档 */
  async rename(userId: number, slot: number, name: string): Promise<Save> {
    const save = await this.getBySlot(userId, slot);
    if (!save) throw new NotFoundException(`存档槽位 ${slot} 不存在`);
    save.name = name;
    return this.saveRepo.save(save);
  }

  /** 删除存档 */
  async remove(userId: number, slot: number): Promise<void> {
    const save = await this.getBySlot(userId, slot);
    if (!save) throw new NotFoundException(`存档槽位 ${slot} 不存在`);
    await this.saveRepo.remove(save);
  }
}
