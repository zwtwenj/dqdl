import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PlayerModule } from './player/player.module';
import { LocationModule } from './location/location.module';
import { NpcModule } from './npc/npc.module';
import { ItemModule } from './item/item.module';
import { BackpackModule } from './backpack/backpack.module';
import { TaskModule } from './task/task.module';
import { MobModule } from './mob/mob.module';
import { TechniqueModule } from './technique/technique.module';
import { SkillModule } from './skill/skill.module';
import { BuffModule } from './buff/buff.module';
import { BattleModule } from './battle/battle.module';
import { DungeonModule } from './dungeon/dungeon.module';
import { AgentModule } from './agent/agent.module';
import { TrainingModule } from './training/training.module';
import { EncounterModule } from './encounter/encounter.module';
import { CultivationModule } from './cultivation/cultivation.module';
import { RandomEventModule } from './random-event/random-event.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get<string>('DB_HOST'),
        port: config.get<number>('DB_PORT'),
        username: config.get<string>('DB_USER'),
        password: config.get<string>('DB_PASSWORD'),
        database: config.get<string>('DB_DATABASE'),
        entities: [__dirname + '/**/*.entity{.ts,.js}'],
        synchronize: config.get<string>('SYNC', 'true') === 'true',
      }),
    }),
    PlayerModule,
    LocationModule,
    NpcModule,
    ItemModule,
    BackpackModule,
    TaskModule,
    MobModule,
    TechniqueModule,
    SkillModule,
    BuffModule,
    BattleModule,
    DungeonModule,
    AgentModule,
    TrainingModule,
    EncounterModule,
    CultivationModule,
    RandomEventModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}