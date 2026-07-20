import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pill } from './pill.entity';
import { Item } from '../item/item.entity';
import { Backpack } from '../backpack/backpack.entity';
import { Player } from '../player/player.entity';
import { PillService } from './pill.service';

/**
 * 丹药模块：丹药效果定义查询。
 * 使用丹药的逻辑已迁移到 ItemModule 的 ItemUseService（通用使用总线，按 item.type 分发）。
 * 本模块只保留 PillService（丹药定义查询），供 ItemUseService / ShopService 注入。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Pill, Item, Backpack, Player]),
  ],
  providers: [PillService],
  exports: [PillService],
})
export class PillModule {}
