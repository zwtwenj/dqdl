import { Module } from '@nestjs/common';
import { AgentLogService } from './agent-log.service';
import { AgentLogController } from './agent-log.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [AgentLogService],
  controllers: [AgentLogController],
})
export class AgentLogModule {}
