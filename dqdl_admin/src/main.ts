import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

/**
 * 管理平台后端入口。
 * 独立端口（ADMIN_PORT，默认 4000），全局前缀 /api，开 CORS 供管理前端跨域。
 * 与游戏后端 dqdl_server1.0 完全隔离（独立进程、独立 JWT secret、独立 admin_users 表）。
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  app.setGlobalPrefix('api');
  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = config.get<number>('ADMIN_PORT') || 4000;
  await app.listen(port);
  console.log(`🔧 管理平台后端启动: http://localhost:${port}/api`);
}
bootstrap();
