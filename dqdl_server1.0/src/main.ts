import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  // 全局校验管道：自动剔除未声明字段，类型转换
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 全局 API 前缀
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = config.get<number>('APP_PORT', 3000);

  await app.listen(port);
  console.log(`🟢 服务已启动: http://localhost:${port}`);
}
bootstrap();

