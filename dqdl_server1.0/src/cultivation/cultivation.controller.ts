import {
  Controller,
  Get,
  Post,
  Body,
  Res,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Response, Request } from 'express';
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

  /** 修炼 SSE 流：每 interval 结算一次；到期/修满/金币不足/停止时结束。
   *  token 走 ?token= query（EventSource 无法设 header）。
   *  断开不结束会话——保留 active + status=4，重连时 /resume 补发。 */
  @Get('stream')
  async stream(@Req() req: any, @Res() res: Response) {
    const player = await this.playerService.verifyOwnershipByUser(req.user.id);
    const playerId = player.id;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(
      `event: init\ndata: ${JSON.stringify({ interval: this.cultivationService.interval })}\n\n`,
    );

    // 建立连接前先补发断线期间的漏算
    try {
      const resumeResult = await this.cultivationService.resume(playerId);
      if (resumeResult) {
        res.write(`event: resume\ndata: ${JSON.stringify(resumeResult)}\n\n`);
        if (resumeResult.finished) {
          res.write(
            `event: stop\ndata: ${JSON.stringify({ reason: resumeResult.reason })}\n\n`,
          );
          res.end();
          return;
        }
      }
    } catch (err: any) {
      res.write(
        `event: error\ndata: ${JSON.stringify({ message: err.message || 'resume 失败' })}\n\n`,
      );
      res.end();
      return;
    }

    let running = true;
    const closeHandler = () => {
      running = false;
    };
    req.on('close', closeHandler);

    while (running) {
      const session = await this.cultivationService.getCurrent(playerId);
      if (!session) {
        res.write('event: stop\ndata: {}\n\n');
        break;
      }
      try {
        const result = await this.cultivationService.settle(playerId);
        if (!result) {
          res.write('event: stop\ndata: {}\n\n');
          break;
        }
        res.write(`data: ${JSON.stringify(result)}\n\n`);
        if (result.finished) {
          res.write(
            `event: stop\ndata: ${JSON.stringify({ reason: result.reason })}\n\n`,
          );
          break;
        }
      } catch (err: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
        break;
      }
      await new Promise<void>((r) => setTimeout(r, this.cultivationService.interval));
    }
    // 断开/结束只关闭响应，不回收会话（保留 active + status=4，重连时 resume 补发）
    req.off('close', closeHandler);
    res.end();
  }
}
