import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mob } from './mob.entity';
import { MobService } from './mob.service';
import { MobController } from './mob.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Mob])],
  controllers: [MobController],
  providers: [MobService],
  exports: [MobService],
})
export class MobModule {}
