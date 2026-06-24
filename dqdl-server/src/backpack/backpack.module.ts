import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Backpack } from './backpack.entity';
import { BackpackService } from './backpack.service';
import { BackpackController } from './backpack.controller';
import { ItemModule } from '../item/item.module';
import { PlayerModule } from '../player/player.module';

@Module({
  imports: [TypeOrmModule.forFeature([Backpack]), ItemModule, PlayerModule],
  controllers: [BackpackController],
  providers: [BackpackService],
  exports: [BackpackService],
})
export class BackpackModule {}
