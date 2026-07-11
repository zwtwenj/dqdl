import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BattleLog } from './battle-log.entity';
import { BattleService } from './battle.service';
import { BattleController } from './battle.controller';
import { PlayerModule } from '../player/player.module';
import { MobModule } from '../mob/mob.module';
import { BuffModule } from '../buff/buff.module';
import { SkillModule } from '../skill/skill.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([BattleLog]),
    PlayerModule,
    MobModule,
    BuffModule,
    SkillModule,
    AuthModule,
  ],
  providers: [BattleService],
  controllers: [BattleController],
  exports: [BattleService],
})
export class BattleModule {}
