/**
 * 统一业务码定义。
 * 后端所有响应统一为 { code, message, data }：
 *   - 成功：code = 0
 *   - 失败：code 为下列业务码，HTTP 状态统一 200，前端只看 code
 */
export const ResponseCode = {
  /** 成功 */
  OK: 0,
  /** 参数校验错误 */
  BAD_REQUEST: 1001,
  /** 未登录或 token 失效 */
  UNAUTHORIZED: 1002,
  /** 无权操作（已登录但无权访问该资源） */
  FORBIDDEN: 1003,
  /** 业务状态冲突（如修为不足、状态忙碌、子节点已生成） */
  CONFLICT: 1004,
  /** 资源不存在 */
  NOT_FOUND: 1005,
  /** 角色已满 */
  CHARACTERS_FULL: 1006,
  /** 服务器内部错误 */
  INTERNAL_ERROR: 1099,
} as const;

/** HTTP status → 业务码映射（用于 HttpException 兜底） */
export const HTTP_TO_CODE: Record<number, number> = {
  400: ResponseCode.BAD_REQUEST,
  401: ResponseCode.UNAUTHORIZED,
  403: ResponseCode.FORBIDDEN,
  404: ResponseCode.NOT_FOUND,
  409: ResponseCode.CONFLICT,
};

/** 统一响应体类型 */
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}
