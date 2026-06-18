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
}
