import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { PlayerModule } from '../player/player.module';
import { LocationModule } from '../location/location.module';
import { LocationNetModule } from '../location_net/location-net.module';
import { CultivationModule } from '../cultivation/cultivation.module';
import { ScriptModule } from '../script/script.module';
import { MoveModule } from '../move/move.module';
import { GameService } from './game.service';
import { GameController } from './game.controller';

/**
 * 游戏入口模块。
 * enterCharacter 进入游戏时聚合进行中事件（剧本/修炼），需注入对应 service。
 */
@Module({
  imports: [
    AuthModule,
    CharacterModule,
    PlayerModule,
    LocationModule,
    LocationNetModule,
    CultivationModule,
    ScriptModule,
    MoveModule,
  ],
  providers: [GameService],
  controllers: [GameController],
})
export class GameModule {}
