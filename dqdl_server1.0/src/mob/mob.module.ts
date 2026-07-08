import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Mob } from './mob.entity';
import { MobService } from './mob.service';

@Module({
  imports: [TypeOrmModule.forFeature([Mob])],
  providers: [MobService],
  exports: [MobService],
})
export class MobModule {}
