import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ResponseCode, HTTP_TO_CODE } from './response-code';
import { BizException } from './biz.exception';

/**
 * 全局异常过滤器：捕获所有异常，统一输出 { code, message, data: null }。
 * HTTP 状态统一 200，前端只看业务 code。
 *
 * 优先级：
 *  1. BizException — 直接使用其 bizCode / message
 *  2. HttpException — 按 status 映射业务码
 *  3. 其他异常 — 1099 服务器内部错误
 */
@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let code: number;
    let message: string;

    if (exception instanceof BizException) {
      // 业务异常：直接用其 code/message
      code = exception.bizCode;
      message = (exception.getResponse() as any)?.message || exception.message;
    } else if (exception instanceof HttpException) {
      // HttpException：按 status 映射业务码
      const status = exception.getStatus();
      code = HTTP_TO_CODE[status] ?? ResponseCode.INTERNAL_ERROR;
      const resp = exception.getResponse();
      message =
        typeof resp === 'string'
          ? resp
          : (resp as any)?.message || exception.message;
      // class-validator 的 message 是数组，取第一条
      if (Array.isArray(message)) message = message[0];
    } else {
      // 未知异常
      code = ResponseCode.INTERNAL_ERROR;
      message = '服务器内部错误';
      this.logger.error(
        `未处理异常: ${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    // 业务日志（非 1099 的常见错误记 warn，便于排查）
    if (code !== ResponseCode.INTERNAL_ERROR) {
      this.logger.warn(`${req.method} ${req.url} → code=${code} ${message}`);
    }

    res.status(200).json({ code, message, data: null });
  }
}
