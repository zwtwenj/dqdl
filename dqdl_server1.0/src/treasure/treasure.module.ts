import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Treasure } from './treasure.entity';
import { TreasureService } from './treasure.service';

/**
 * 宝物模块：宝物定义查询。
 * TreasureService 对外 export，供 PlayerService / ItemUseService 注入。
 * 不 import PlayerModule（避免循环依赖）。
 */
@Module({
  imports: [TypeOrmModule.forFeature([Treasure])],
  providers: [TreasureService],
  exports: [TreasureService],
})
export class TreasureModule {}
