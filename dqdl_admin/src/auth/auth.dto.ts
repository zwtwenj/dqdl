import { IsString, MinLength, MaxLength, Matches } from 'class-validator';

/** 登录入参 */
export class LoginDto {
  @IsString()
  @Matches(/^[a-zA-Z0-9_]+$/, { message: '账号只能含字母数字下划线' })
  @MinLength(3)
  @MaxLength(32)
  username: string;

  @IsString()
  @MinLength(6)
  @MaxLength(64)
  password: string;
}
