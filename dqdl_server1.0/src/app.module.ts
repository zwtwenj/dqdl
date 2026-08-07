import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { AuthModule } from './auth/auth.module';
import { CharacterModule } from './character/character.module';
import { PlayerModule } from './player/player.module';
import { LocationModule } from './location/location.module';
import { GameModule } from './game/game.module';
import { MobModule } from './mob/mob.module';
import { AlchemyModule } from './alchemy/alchemy.module';
import { MaterialModule } from './material/material.module';
import { MagicCoreModule } from './magic_core/magic_core.module';
import { TechniqueModule } from './technique/technique.module';
import { SkillModule } from './skill/skill.module';
import { BuffModule } from './buff/buff.module';
import { BattleModule } from './battle/battle.module';
import { ItemModule } from './item/item.module';
import { BackpackModule } from './backpack/backpack.module';
import { TrainingModule } from './training/training.module';
import { NpcModule } from './npc/npc.module';
import { ShopModule } from './shop/shop.module';
import { PillModule } from './pill/pill.module';
import { TreasureModule } from './treasure/treasure.module';
import { MoveModule } from './move/move.module';
import { EncounterModule } from './encounter/encounter.module';
import { DungeonModule } from './dungeon/dungeon.module';
import { CultivationModule } from './cultivation/cultivation.module';
import { MapDemoModule } from './mapdemo/mapdemo.module';
import { LocationNetModule } from './location_net/location-net.module';
import { TaskModule } from './task/task.module';
import { ScriptModule } from './script/script.module';
import { StoryModule } from './story/story.module';
import { AppController } from './app.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // 事件总线：5 个游戏钩子(突破/进入场景/...)通过 emit 触发剧本检查等监听者。
    // 本轮用于剧本触发引擎（ScriptTriggerService @OnEvent('script.hook')）。
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST'),
        port: +config.get('DB_PORT', '3306'),
        username: config.get('DB_USER'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_DATABASE'),
        autoLoadEntities: true,
        synchronize: false,
        charset: 'utf8mb4',
      }),
    }),
    AuthModule,
    CharacterModule,
    PlayerModule,
    LocationModule,
    GameModule,
    MobModule,
    AlchemyModule,
    MaterialModule,
    MagicCoreModule,
    TechniqueModule,
    SkillModule,
    BuffModule,
    BattleModule,
    ItemModule,
    BackpackModule,
    TrainingModule,
    NpcModule,
    ShopModule,
    PillModule,
    TreasureModule,
    MoveModule,
    EncounterModule,
    DungeonModule,
    CultivationModule,
    MapDemoModule,
    LocationNetModule,
    TaskModule,
    ScriptModule,
    StoryModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
