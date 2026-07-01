import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PillRecipe } from './pill-recipe.entity';
import { AlchemyService } from './alchemy.service';
import { AlchemyController } from './alchemy.controller';
import { ItemModule } from '../item/item.module';
import { PlayerModule } from '../player/player.module';
import { BackpackModule } from '../backpack/backpack.module';

@Module({
  imports: [TypeOrmModule.forFeature([PillRecipe]), ItemModule, PlayerModule, BackpackModule],
  controllers: [AlchemyController],
  providers: [AlchemyService],
})
export class AlchemyModule {}
