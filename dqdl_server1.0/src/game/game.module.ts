import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CharacterModule } from '../character/character.module';
import { PlayerModule } from '../player/player.module';
import { LocationModule } from '../location/location.module';
import { GameService } from './game.service';
import { GameController } from './game.controller';

@Module({
  imports: [AuthModule, CharacterModule, PlayerModule, LocationModule],
  providers: [GameService],
  controllers: [GameController],
})
export class GameModule {}
