import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Player } from './player.entity';
import { PlayerService } from './player.service';
import { PlayerController } from './player.controller';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { LocationModule } from '../location/location.module';
import { TechniqueModule } from '../technique/technique.module';
import { SkillModule } from '../skill/skill.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Player]),
    AuthModule,
    CharacterModule,
    LocationModule,
    TechniqueModule,
    SkillModule,
  ],
  providers: [PlayerService],
  controllers: [PlayerController],
  exports: [PlayerService],
})
export class PlayerModule {}
