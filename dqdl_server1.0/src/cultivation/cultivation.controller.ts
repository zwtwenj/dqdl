import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { CultivationService } from './cultivation.service';
import { PlayerService } from '../player/player.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 统一修炼接口（合并洞天福地 + 修炼室）。
 *
 *   GET  /config          修炼室档位信息 + 时长范围
 *   POST /enter           进入：body { scene, encounterId?, tier?, duration? }
 *                             scene='blessed' → enterBlessed(encounterId)
 *                             scene='room'    → enterRoom(tier, duration)（duration=分钟）
 *   GET  /current         当前进行中的修炼会话
 *   GET  /latest          最近一次会话（含已结束，供结算页）
 *   GET  /resume          重连补偿：按断线时长批量补发漏算（SSE 建立前调用）
 *   POST /stop            主动停止
 *   GET  /stream          SSE 流：每 interval 结算一次，到期/修满/金币不足时结束
 *
 * 鉴权：JWT（普通接口走 header；SSE 走 ?token= query，EventSource 无法设 header）。
 *
 * 关键：SSE 断开不再结束会话（保留 active + status=4，玩家锁定）。
 *      离线补偿改为惰性——重连时 /resume 按实际经过时间补发。
 */
@Controller('cultivation')
@UseGuards(JwtAuthGuard)
export class CultivationController {
  constructor(
    private readonly cultivationService: CultivationService,
    private readonly playerService: PlayerService,
  ) {}

  /** 修炼室档位信息 + 玩家可修炼的斗技/功法列表 GET /api/cultivation/config */
  @Get('config')
  async config(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.cultivationService.getOptions(player.id);
  }

  /** 进入修炼 POST /api/cultivation/enter
   *  body { scene, encounterId?, tier?, duration?, mode?, targetId? }
   *    scene='blessed' → enterBlessed(encounterId)
   *    scene='room'    → enterRoom(tier, duration, mode?, targetId?)
   *      mode: qi(默认)/skill/technique；skill/technique 需 targetId */
  @Post('enter')
  async enter(
    @Body() body: {
      scene?: string;
      encounterId?: number;
      tier?: number;
      duration?: number;
      mode?: string;
      targetId?: number;
    },
    @Req() req: any,
  ) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    const scene = body.scene || 'blessed';
    if (scene === 'room') {
      if (!body.tier) return { code: 1, message: '缺少 tier' };
      if (!body.duration) return { code: 1, message: '缺少 duration(分钟)' };
      const session = await this.cultivationService.enterRoom(
        player.id,
        Number(body.tier),
        Number(body.duration),
        body.mode || 'qi',
        body.targetId != null ? Number(body.targetId) : undefined,
      );
      return { ...session, interval: this.cultivationService.interval };
    }
    // blessed
    if (!body.encounterId) return { code: 1, message: '缺少 encounterId' };
    const session = await this.cultivationService.enterBlessed(player.id, Number(body.encounterId));
    return { ...session, interval: this.cultivationService.interval };
  }

  /** 当前进行中的修炼会话 GET /api/cultivation/current */
  @Get('current')
  async current(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.cultivationService.getCurrent(player.id);
  }

  /** 最近一次会话 GET /api/cultivation/latest */
  @Get('latest')
  async latest(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.cultivationService.getLatest(player.id);
  }

  /** 重连补偿（惰性离线结算）GET /api/cultivation/resume */
  @Get('resume')
  async resume(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    return this.cultivationService.resume(player.id);
  }

  /** 主动停止 POST /api/cultivation/stop → 返回最近会话汇总 */
  @Post('stop')
  async stop(@Req() req: any) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    const latest = await this.cultivationService.stop(player.id);
    return { ok: true, session: latest };
  }

  /** 修炼 SSE 已合并到通用 SSE（/api/script/stream）：
   *  后端定时器每 interval 结算一次 → 推 cultivation_settle 事件；
   *  结束（满/到期/轮数）推 cultivation_finished。
   *  本路由已废弃（保留注释说明迁移去向）。 */
}
