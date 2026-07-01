import { Module } from '@nestjs/common';
import { GatherService } from './gather.service';
import { GatherController } from './gather.controller';
import { PlayerModule } from '../player/player.module';
import { LocationModule } from '../location/location.module';
import { BackpackModule } from '../backpack/backpack.module';
import { ItemModule } from '../item/item.module';

@Module({
  imports: [PlayerModule, LocationModule, BackpackModule, ItemModule],
  controllers: [GatherController],
  providers: [GatherService],
})
export class GatherModule {}
