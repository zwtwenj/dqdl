import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { ConfigService } from '@nestjs/config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  const config = app.get(ConfigService);
  const port = config.get<number>('APP_PORT', 3000);
  await app.listen(port);
  console.log(`🟢 服务已启动: http://localhost:${port}`);
}
bootstrap();
