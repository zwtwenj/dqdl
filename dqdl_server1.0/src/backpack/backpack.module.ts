import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Backpack } from './backpack.entity';
import { BackpackLog } from './backpack-log.entity';
import { BackpackService } from './backpack.service';
import { BackpackController } from './backpack.controller';
import { PlayerModule } from '../player/player.module';
import { ItemModule } from '../item/item.module';

@Module({
  imports: [TypeOrmModule.forFeature([Backpack, BackpackLog]), PlayerModule, ItemModule],
  providers: [BackpackService],
  controllers: [BackpackController],
  exports: [BackpackService],
})
export class BackpackModule {}
