import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';
import { join } from 'path';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  app.enableCors({ origin: true, credentials: true });
  app.useStaticAssets(join(__dirname, '..', 'public'));
  const config = app.get(ConfigService);
  const port = config.get<number>('APP_PORT', 3000);
  await app.listen(port);
  console.log(`🟢 服务已启动: http://localhost:${port}`);
}
bootstrap();
