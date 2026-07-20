import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from './item.entity';
import { Backpack } from '../backpack/backpack.entity';
import { Player } from '../player/player.entity';
import { Pill } from '../pill/pill.entity';
import { ItemService } from './item.service';
import { ItemUseService } from './item-use.service';
import { ItemController } from './item.controller';
import { AuthModule } from '../auth/auth.module';
import { PlayerModule } from '../player/player.module';
import { TreasureModule } from '../treasure/treasure.module';

/**
 * 物品模块：物品定义查询 + 通用使用（按 type 分发：丹药/宝物）。
 * ItemUseService 单事务扣背包+应用效果，需要 Item/Backpack/Player/Pill 实体。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Item, Backpack, Player, Pill]),
    AuthModule,
    PlayerModule,
    TreasureModule,
  ],
  providers: [ItemService, ItemUseService],
  controllers: [ItemController],
  exports: [ItemService],
})
export class ItemModule {}
