import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CultivationRoomSession } from './cultivation_room_session.entity';
import { CultivationRoomService } from './cultivation-room.service';
import { CultivationRoomController } from './cultivation-room.controller';
import { PlayerModule } from '../player/player.module';

@Module({
  imports: [TypeOrmModule.forFeature([CultivationRoomSession]), PlayerModule],
  providers: [CultivationRoomService],
  controllers: [CultivationRoomController],
  exports: [CultivationRoomService],
})
export class CultivationRoomModule {}
