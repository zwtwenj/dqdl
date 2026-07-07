import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { AuthDto } from './auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** 注册 POST /api/auth/register { username, password } */
  @Post('register')
  register(@Body() dto: AuthDto) {
    return this.auth.register(dto);
  }

  /** 登录 POST /api/auth/login { username, password } → { token, user } */
  @Post('login')
  login(@Body() dto: AuthDto) {
    return this.auth.login(dto);
  }
}
