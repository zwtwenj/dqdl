import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  OnApplicationBootstrap,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User } from './user.entity';
import { AuthDto } from './auth.dto';

export interface JwtPayload {
  sub: number;       // user.id
  username: string;
}

@Injectable()
export class AuthService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
  ) {}

  /** 应用启动时确保默认 admin 账户存在 */
  async onApplicationBootstrap() {
    await this.ensureDefaultAdmin();
  }

  /** 注册新账号 */
  async register(dto: AuthDto): Promise<{ id: number; username: string }> {
    const exists = await this.userRepo.findOneBy({ username: dto.username });
    if (exists) throw new ConflictException('账号已存在');

    const hashed = await bcrypt.hash(dto.password, 10);
    const user = await this.userRepo.save(
      this.userRepo.create({ username: dto.username, password: hashed }),
    );
    this.logger.log(`新注册账号: ${user.username} (id=${user.id})`);
    return { id: user.id, username: user.username };
  }

  /** 登录：校验密码 → 签发 JWT */
  async login(dto: AuthDto): Promise<{ token: string; user: { id: number; username: string } }> {
    const user = await this.userRepo.findOneBy({ username: dto.username });
    if (!user) throw new UnauthorizedException('账号或密码错误');

    const ok = await bcrypt.compare(dto.password, user.password);
    if (!ok) throw new UnauthorizedException('账号或密码错误');

    const payload: JwtPayload = { sub: user.id, username: user.username };
    const token = await this.jwtService.signAsync(payload);
    return { token, user: { id: user.id, username: user.username } };
  }

  /** 根据 id 查账号（JWT 策略用） */
  async findById(id: number): Promise<User | null> {
    return this.userRepo.findOneBy({ id });
  }

  /** 确保 admin/123456 默认账号存在（幂等） */
  private async ensureDefaultAdmin() {
    const exists = await this.userRepo.findOneBy({ username: 'admin' });
    if (exists) {
      this.logger.log('默认 admin 账户已存在，跳过');
      return;
    }
    const hashed = await bcrypt.hash('123456', 10);
    await this.userRepo.save(
      this.userRepo.create({ username: 'admin', password: hashed, nickname: '管理员' }),
    );
    this.logger.log('✅ 已创建默认账户 admin/123456');
  }
}
