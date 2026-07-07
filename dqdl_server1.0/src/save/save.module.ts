import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Save } from './save.entity';
import { SaveService } from './save.service';
import { SaveController } from './save.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Save]), AuthModule],
  providers: [SaveService],
  controllers: [SaveController],
  exports: [SaveService],
})
export class SaveModule {}
