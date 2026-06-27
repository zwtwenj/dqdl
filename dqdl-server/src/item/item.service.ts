import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { Item } from './item.entity';
import { CreateItemDto } from './dto/create-item.dto';

@Injectable()
export class ItemService {
  constructor(
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
  ) {}

  async create(dto: CreateItemDto): Promise<Item> {
    return this.itemRepo.save(this.itemRepo.create(dto));
  }

  async findAll(): Promise<Item[]> {
    return this.itemRepo.find({ order: { id: 'ASC' } });
  }

  async findOne(id: number): Promise<Item | null> {
    return this.itemRepo.findOneBy({ id });
  }

  /** 按主键批量查找（NPC 商店用） */
  async findByIds(ids: number[]): Promise<Item[]> {
    if (!ids.length) return [];
    return this.itemRepo.find({ where: { id: In(ids) } });
  }

  async findByType(type: string): Promise<Item[]> {
    return this.itemRepo.find({ where: { type }, order: { id: 'ASC' } });
  }

  /** 根据全局 item_id 查找（如 cl-340） */
  async findByItemId(itemId: string): Promise<Item | null> {
    return this.itemRepo.findOneBy({ item_id: itemId });
  }

  /** 批量根据 item_id 查找 */
  async findByItemIds(itemIds: string[]): Promise<Item[]> {
    if (!itemIds.length) return [];
    return this.itemRepo.find({ where: { item_id: In(itemIds) } });
  }

  /** 按物品名查找（背包出售/校验用） */
  async findByName(name: string): Promise<Item | null> {
    return this.itemRepo.findOneBy({ name });
  }

  /** 按名称批量查找（背包 enrichment 用） */
  async findByNames(names: string[]): Promise<Item[]> {
    if (!names.length) return [];
    return this.itemRepo.find({ where: { name: In(names) } });
  }

  /** 按关键词检索某类型物品（副本魔核奖励用） */
  async findByTypeAndNameKeyword(type: string, keyword: string): Promise<Item[]> {
    return this.itemRepo
      .createQueryBuilder('i')
      .where('i.type = :t', { t: type })
      .andWhere('i.name LIKE :k', { k: `%${keyword}%` })
      .getMany();
  }
}
