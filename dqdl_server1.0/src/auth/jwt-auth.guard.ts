import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/** JWT 鉴权守卫：加在 Controller 上即要求 Bearer token，req.user = { id, username } */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
