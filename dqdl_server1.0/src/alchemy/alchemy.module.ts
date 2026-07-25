import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alchemy } from './alchemy.entity';
import { PillRecipe } from './pill-recipe.entity';
import { AlchemyService } from './alchemy.service';
import { AlchemyController } from './alchemy.controller';
import { ItemModule } from '../item/item.module';
import { PlayerModule } from '../player/player.module';
import { BackpackModule } from '../backpack/backpack.module';

/**
 * 炼丹模块：丹方/材料/丹炉管理 + 炼丹核心算法。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Alchemy, PillRecipe]),
    ItemModule,
    PlayerModule,
    BackpackModule,
  ],
  providers: [AlchemyService],
  controllers: [AlchemyController],
  exports: [AlchemyService],
})
export class AlchemyModule {}
