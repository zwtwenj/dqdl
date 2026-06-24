import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Item } from './item.entity';
import { ItemService } from './item.service';
import { ItemUseService } from './item-use.service';
import { ItemController } from './item.controller';
import { PlayerModule } from '../player/player.module';

@Module({
  imports: [TypeOrmModule.forFeature([Item]), PlayerModule],
  controllers: [ItemController],
  providers: [ItemService, ItemUseService],
  exports: [ItemService, ItemUseService],
})
export class ItemModule {}
