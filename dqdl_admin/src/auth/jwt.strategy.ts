import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';

/**
 * JWT 策略：从 Authorization: Bearer <token> 提取，用独立 secret 验证。
 * validate 回调把管理员信息挂到 req.user。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') || 'dqdl-admin-secret',
    });
  }

  async validate(payload: { sub: number; username: string }): Promise<{ id: number; username: string; nickname: string | null }> {
    const user = await this.auth.validateUser(payload.sub);
    if (!user) throw new UnauthorizedException('token 无效');
    return user;
  }
}
