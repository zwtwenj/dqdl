import { Injectable, OnApplicationBootstrap, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { ConfigService } from '@nestjs/config';
import { AdminUser } from './admin-user.entity';

/**
 * 管理员鉴权服务：登录校验 + JWT 签发（独立 secret）+ 启动时创建默认管理员。
 * 与游戏后端 auth 完全隔离（不同 secret、不同账号表、不同守卫）。
 */
@Injectable()
export class AuthService implements OnApplicationBootstrap {
  constructor(
    @InjectRepository(AdminUser)
    private readonly repo: Repository<AdminUser>,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** 启动时幂等创建默认 admin/123456 */
  async onApplicationBootstrap() {
    const username = this.config.get<string>('ADMIN_DEFAULT_USERNAME') || 'admin';
    const password = this.config.get<string>('ADMIN_DEFAULT_PASSWORD') || '123456';
    const exist = await this.repo.findOneBy({ username });
    if (!exist) {
      const hash = await bcrypt.hash(password, 10);
      await this.repo.save(this.repo.create({ username, password: hash, nickname: '管理员' }));
      console.log(`🔐 已创建默认管理员: ${username} / ${password}（请及时改密）`);
    }
  }

  /** 登录：bcrypt 校验 → 签发 JWT（payload { sub, username }，7d 过期） */
  async login(username: string, password: string): Promise<{ token: string; user: { id: number; username: string; nickname: string | null } }> {
    const user = await this.repo.findOneBy({ username });
    if (!user) throw new UnauthorizedException('账号或密码错误');
    const ok = await bcrypt.compare(password, user.password);
    if (!ok) throw new UnauthorizedException('账号或密码错误');
    const token = await this.jwt.signAsync({ sub: user.id, username: user.username });
    return { token, user: { id: user.id, username: user.username, nickname: user.nickname } };
  }

  /** JWT Strategy 回调：按 payload.sub 查管理员，挂到 req.user */
  async validateUser(id: number): Promise<{ id: number; username: string; nickname: string | null } | null> {
    const user = await this.repo.findOneBy({ id });
    if (!user) return null;
    return { id: user.id, username: user.username, nickname: user.nickname };
  }
}
