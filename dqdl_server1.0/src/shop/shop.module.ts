import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NpcShop } from './shop.entity';
import { Item } from '../item/item.entity';
import { StaticNpc } from '../npc/static-npc.entity';
import { ShopService } from './shop.service';
import { ShopController } from './shop.controller';
import { AuthModule } from '../auth/auth.module';

/**
 * 商店模块：商品查询（npc_role 维度配货）。
 * 复用 Item / StaticNpc 实体；购买/出售逻辑待后续原子接入。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([NpcShop, Item, StaticNpc]),
    AuthModule,
  ],
  providers: [ShopService],
  controllers: [ShopController],
  exports: [ShopService],
})
export class ShopModule {}
