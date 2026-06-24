import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DungeonInstance } from './dungeon_instance.entity';
import { DungeonService } from './dungeon.service';
import { DungeonController } from './dungeon.controller';
import { PlayerModule } from '../player/player.module';
import { BackpackModule } from '../backpack/backpack.module';
import { ItemModule } from '../item/item.module';
import { MobModule } from '../mob/mob.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([DungeonInstance]),
    PlayerModule,
    BackpackModule,
    ItemModule,
    MobModule,
  ],
  controllers: [DungeonController],
  providers: [DungeonService],
  exports: [DungeonService],
})
export class DungeonModule {}
