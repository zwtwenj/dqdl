import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Technique } from './technique.entity';
import { TechniqueService } from './technique.service';

@Module({
  imports: [TypeOrmModule.forFeature([Technique])],
  providers: [TechniqueService],
  exports: [TechniqueService],
})
export class TechniqueModule {}
