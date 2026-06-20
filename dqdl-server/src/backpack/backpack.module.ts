import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Backpack } from './backpack.entity';
import { BackpackService } from './backpack.service';
import { BackpackController } from './backpack.controller';
import { Item } from '../item/item.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Backpack, Item])],
  controllers: [BackpackController],
  providers: [BackpackService],
  exports: [BackpackService],
})
export class BackpackModule {}
