import { Module } from '@nestjs/common';
import { EventManagementService } from './event-management.service';
import { EventManagementController } from './event-management.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [EventManagementService],
  controllers: [EventManagementController],
})
export class EventManagementModule {}
