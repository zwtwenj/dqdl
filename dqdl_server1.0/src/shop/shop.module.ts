import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NpcShop } from './shop.entity';
import { Item } from '../item/item.entity';
import { StaticNpc } from '../npc/static-npc.entity';
import { Player } from '../player/player.entity';
import { Backpack } from '../backpack/backpack.entity';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { AuthModule } from '../auth/auth.module';
import { PlayerModule } from '../player/player.module';

/**
 * 商店模块：商品查询 + 原子买/卖。
 * buy/sell 在单事务内完成（player 锁行扣钱 + backpack 增删），返回新 money。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([NpcShop, Item, StaticNpc, Player, Backpack]),
    AuthModule,
    PlayerModule,
  ],
  providers: [ShopService],
  controllers: [ShopController],
  exports: [ShopService],
})
export class ShopModule {}
