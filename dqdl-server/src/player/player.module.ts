import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Player } from './player.entity';
import { PlayerService } from './player.service';
import { PlayerController } from './player.controller';
import { TechniqueModule } from '../technique/technique.module';
import { TreasureModule } from '../treasure/treasure.module';

@Module({
  imports: [TypeOrmModule.forFeature([Player]), TechniqueModule, TreasureModule],
  controllers: [PlayerController],
  providers: [PlayerService],
  exports: [PlayerService],
})
export class PlayerModule {}
