import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Treasure } from './treasure.entity';
import { TreasureService } from './treasure.service';

@Module({
  imports: [TypeOrmModule.forFeature([Treasure])],
  providers: [TreasureService],
  exports: [TreasureService],
})
export class TreasureModule {}
