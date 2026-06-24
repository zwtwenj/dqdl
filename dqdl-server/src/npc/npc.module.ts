import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaticNpc } from './static-npc.entity';
import { Nature } from './nature.entity';
import { NpcRole } from './npc-role.entity';
import { DialogEvent } from './dialog-event.entity';
import { NpcService } from './npc.service';
import { NpcController } from './npc.controller';
import { LocationModule } from '../location/location.module';

@Module({
  imports: [TypeOrmModule.forFeature([StaticNpc, Nature, NpcRole, DialogEvent]), LocationModule],
  controllers: [NpcController],
  providers: [NpcService],
  exports: [NpcService],
})
export class NpcModule {}
