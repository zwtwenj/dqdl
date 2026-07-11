import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Buff } from './buff.entity';
import { BuffEffect } from './buff-effect.entity';
import { BuffService } from './buff.service';

@Module({
  imports: [TypeOrmModule.forFeature([Buff, BuffEffect])],
  providers: [BuffService],
  exports: [BuffService],
})
export class BuffModule {}
