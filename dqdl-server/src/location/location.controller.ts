import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Body,
  Query,
  Res,
  Req,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { LocationService } from './location.service';
import { TrainingService } from './training.service';
import { PlayerService } from '../player/player.service';
import { CreateLocationDto, ExpandLocationDto } from './dto/location.dto';

@Controller('location')
export class LocationController {
  constructor(
    private readonly locationService: LocationService,
    private readonly trainingService: TrainingService,
    private readonly playerService: PlayerService,
  ) {}

  /** 获取根节点列表（斗气大陆） */
  @Get('roots')
  getRoots() {
    return this.locationService.getRoots();
  }

  /** 获取某个节点的详情 */
  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.locationService.findOne(id);
  }

  /** 获取子节点（自动触发懒加载展开） */
  @Get(':id/children')
  getChildren(@Param('id', ParseIntPipe) id: number) {
    return this.locationService.getChildren(id);
  }

  /** 获取整棵子树 */
  @Get(':id/tree')
  getTree(@Param('id', ParseIntPipe) id: number) {
    return this.locationService.getTree(id);
  }

  /** 手动创建地点 */
  @Post()
  create(@Body() dto: CreateLocationDto) {
    return this.locationService.create(dto);
  }

  /** 历练事件 */
  @Post('training')
  training(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Query('locationId', ParseIntPipe) locationId: number,
  ) {
    return this.trainingService.execute(playerId, locationId);
  }

  /** 历练流（SSE） — 自动定时触发历练事件 */
  @Get('training/stream')
  async streamTraining(
    @Query('playerId', ParseIntPipe) playerId: number,
    @Query('locationId', ParseIntPipe) locationId: number,
    @Res() res: Response,
    @Req() req: Request,
  ) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const startTime = Date.now();
    const maxDuration = this.trainingService.trainingMaxDuration;

    res.write(`event: init\ndata: ${JSON.stringify({ interval: this.trainingService.trainingInterval, maxDuration })}\n\n`);

    let running = true;
    req.on('close', () => { running = false; });

    while (running) {
      const elapsed = Date.now() - startTime;
      if (elapsed >= maxDuration) {
        await this.playerService.setStatus(playerId, 1);
        res.write('event: stop\ndata: {}\n\n');
        break;
      }

      const player = await this.playerService.findByIdRaw(playerId);
      if (!player || player.status !== 2) {
        res.write('event: stop\ndata: {}\n\n');
        break;
      }

      try {
        const event = await this.trainingService.execute(playerId, locationId);
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      } catch (err: any) {
        res.write(`event: error\ndata: ${JSON.stringify({ message: err.message })}\n\n`);
      }

      await new Promise<void>(r => setTimeout(r, this.trainingService.trainingInterval));
    }

    res.end();
  }
}
