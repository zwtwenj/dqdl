import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Skill } from './skill.entity';
import { SkillService } from './skill.service';

@Module({
  imports: [TypeOrmModule.forFeature([Skill])],
  providers: [SkillService],
  exports: [SkillService],
})
export class SkillModule {}
