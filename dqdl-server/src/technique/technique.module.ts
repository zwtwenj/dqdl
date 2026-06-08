import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Technique } from './technique.entity';
import { TechniqueService } from './technique.service';
import { TechniqueController } from './technique.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Technique])],
  controllers: [TechniqueController],
  providers: [TechniqueService],
  exports: [TechniqueService],
})
export class TechniqueModule {}
