import { HttpException, HttpStatus } from '@nestjs/common';
import { ResponseCode } from './response-code';

/**
 * 业务异常：service 层抛出，携带明确业务码。
 * 异常过滤器优先识别 BizException，直接使用其 code/message。
 *
 * 用法：throw new BizException(ResponseCode.CONFLICT, '修为不足，无法突破')
 */
export class BizException extends HttpException {
  /** 业务码（见 ResponseCode） */
  readonly bizCode: number;

  constructor(code: number, message: string, httpStatus: HttpStatus = HttpStatus.OK) {
    super({ code, message, data: null }, httpStatus);
    this.bizCode = code;
  }
}

/** 常用业务异常快捷构造 */
export const Biz = {
  /** 资源不存在 */
  notFound: (msg: string) => new BizException(ResponseCode.NOT_FOUND, msg),
  /** 业务状态冲突 */
  conflict: (msg: string) => new BizException(ResponseCode.CONFLICT, msg),
  /** 无权操作 */
  forbidden: (msg: string) => new BizException(ResponseCode.FORBIDDEN, msg),
  /** 参数错误 */
  badRequest: (msg: string) => new BizException(ResponseCode.BAD_REQUEST, msg),
};
