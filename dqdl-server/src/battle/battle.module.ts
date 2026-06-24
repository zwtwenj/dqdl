import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Buff } from '../buff/buff.entity';
import { BuffEffect } from '../buff/buff-effect.entity';
import { Skill } from '../skill/skill.entity';
import { PlayerModule } from '../player/player.module';
import { MobModule } from '../mob/mob.module';
import { BuffModule } from '../buff/buff.module';
import { SkillModule } from '../skill/skill.module';
import { BattleService } from './battle.service';
import { BattleSeeder } from './battle.seed';
import { BattleController } from './battle.controller';

@Module({
  imports: [
    // BattleSeeder 需要直接操作 buff/buff_effect/skill 表（管理员工具）；
    // BattleService 运行时则通过 BuffService / SkillService 访问数据。
    TypeOrmModule.forFeature([Buff, BuffEffect, Skill]),
    PlayerModule,
    MobModule,
    BuffModule,
    SkillModule,
  ],
  controllers: [BattleController],
  providers: [BattleService, BattleSeeder],
  exports: [BattleService],
})
export class BattleModule {}
