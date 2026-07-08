import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Alchemy } from './alchemy.entity';
import { AlchemyService } from './alchemy.service';

@Module({
  imports: [TypeOrmModule.forFeature([Alchemy])],
  providers: [AlchemyService],
  exports: [AlchemyService],
})
export class AlchemyModule {}
