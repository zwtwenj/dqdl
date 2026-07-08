import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MagicCore } from './magic_core.entity';
import { MagicCoreService } from './magic_core.service';

@Module({
  imports: [TypeOrmModule.forFeature([MagicCore])],
  providers: [MagicCoreService],
  exports: [MagicCoreService],
})
export class MagicCoreModule {}
