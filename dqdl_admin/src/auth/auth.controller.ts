import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './auth.dto';

/**
 * 管理员鉴权接口。
 * 仅登录（注册留后续，管理员一般后台直接建）。登录返回独立 JWT。
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 登录 POST /api/auth/login { username, password } → { token, user } */
  @Post('login')
  login(@Body() body: LoginDto) {
    return this.auth.login(body.username, body.password);
  }
}
