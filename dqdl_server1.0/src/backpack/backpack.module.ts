import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Backpack } from './backpack.entity';
import { BackpackService } from './backpack.service';
import { BackpackController } from './backpack.controller';
import { PlayerModule } from '../player/player.module';

@Module({
  imports: [TypeOrmModule.forFeature([Backpack]), PlayerModule],
  providers: [BackpackService],
  controllers: [BackpackController],
  exports: [BackpackService],
})
export class BackpackModule {}
