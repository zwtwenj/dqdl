import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Buff } from './buff.entity';
import { BuffEffect } from './buff-effect.entity';
import { BuffService } from './buff.service';
import { BuffController } from './buff.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Buff, BuffEffect])],
  controllers: [BuffController],
  providers: [BuffService],
  exports: [BuffService],
})
export class BuffModule {}
