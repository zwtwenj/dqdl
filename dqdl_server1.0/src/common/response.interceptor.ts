import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ResponseCode, ApiResponse } from './response-code';

/**
 * 全局响应拦截器：把所有成功返回值统一包装为 { code, message, data }。
 * 若返回值已是该结构（含 code 字段）则直接放行，避免二次包装。
 */
@Injectable()
export class ResponseInterceptor<T>
  implements NestInterceptor<T, ApiResponse<T> | T>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<ApiResponse<T> | T> {
    return next.handle().pipe(
      map((data) => {
        // 已是统一结构（含数字 code 字段）则放行
        if (
          data &&
          typeof data === 'object' &&
          'code' in data &&
          typeof (data as any).code === 'number'
        ) {
          return data;
        }
        return {
          code: ResponseCode.OK,
          message: 'ok',
          data,
        };
      }),
    );
  }
}
