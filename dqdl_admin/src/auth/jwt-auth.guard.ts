import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** 所有管理接口的鉴权守卫（要求 Authorization: Bearer <token>） */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
