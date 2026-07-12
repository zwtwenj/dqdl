import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Pill } from './pill.entity';
import { Item } from '../item/item.entity';
import { Backpack } from '../backpack/backpack.entity';
import { Player } from '../player/player.entity';
import { PillService } from './pill.service';
import { PillUseService } from './pill-use.service';
import { PillController } from './pill.controller';
import { AuthModule } from '../auth/auth.module';
import { PlayerModule } from '../player/player.module';

/**
 * 丹药模块：丹药效果定义查询 + 使用丹药（单事务扣背包+应用效果）。
 * 使用返回聚合后的 player（含 final_attrs），前端整体刷新。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Pill, Item, Backpack, Player]),
    AuthModule,
    PlayerModule,
  ],
  providers: [PillService, PillUseService],
  controllers: [PillController],
  exports: [PillService],
})
export class PillModule {}
