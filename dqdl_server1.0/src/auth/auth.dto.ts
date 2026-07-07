import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

/** 登录 / 注册请求体 */
export class AuthDto {
  @IsString()
  @MinLength(3, { message: '账号至少 3 个字符' })
  @MaxLength(32, { message: '账号最多 32 个字符' })
  @Matches(/^[a-zA-Z0-9_]+$/, { message: '账号只能包含字母、数字、下划线' })
  username: string;

  @IsString()
  @MinLength(6, { message: '密码至少 6 个字符' })
  @MaxLength(64, { message: '密码最多 64 个字符' })
  password: string;
}
