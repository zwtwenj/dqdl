import { Module } from '@nestjs/common';
import { DbViewerService } from './db-viewer.service';
import { DbViewerController } from './db-viewer.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [DbViewerService],
  controllers: [DbViewerController],
})
export class DbViewerModule {}
