import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthService, JwtPayload } from './auth.service';

/**
 * JWT 策略：从 Authorization: Bearer <token> 提取，校验签发方与有效期。
 * 验证通过后 req.user = { id, username }。
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET', 'dqdl-default-secret-change-me'),
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.auth.findById(payload.sub);
    if (!user) throw new UnauthorizedException('账号不存在或已被删除');
    return { id: user.id, username: user.username };
  }
}
