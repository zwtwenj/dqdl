import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ResponseInterceptor } from './common/response.interceptor';
import { AllExceptionFilter } from './common/all-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: true });

  // 全局校验管道：自动剔除未声明字段，类型转换
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));

  // 全局响应拦截器：统一包装为 { code, message, data }
  app.useGlobalInterceptors(new ResponseInterceptor());

  // 全局异常过滤器：统一输出业务码，HTTP 状态始终 200
  app.useGlobalFilters(new AllExceptionFilter());

  // 全局 API 前缀
  app.setGlobalPrefix('api');

  const config = app.get(ConfigService);
  const port = config.get<number>('APP_PORT', 3000);

  await app.listen(port);
  console.log(`🟢 服务已启动: http://localhost:${port}`);
}
bootstrap();
