import { Controller, Get, Post, Put, Delete, Body, Param, Patch, ParseIntPipe } from '@nestjs/common';
import { PlayerService } from './player.service';
import { CreatePlayerDto } from './dto/create-player.dto';
import { UpdatePositionDto } from './dto/update-position.dto';

@Controller('player')
export class PlayerController {
  constructor(private readonly playerService: PlayerService) {}

  @Post()
  create(@Body() dto: CreatePlayerDto) {
    return this.playerService.create(dto);
  }

  @Get()
  findAll() {
    return this.playerService.findAll();
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.playerService.findOne(id);
  }

  @Put(':id')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updates: Partial<CreatePlayerDto>,
  ) {
    return this.playerService.update(id, updates);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.playerService.remove(id);
  }

  @Patch(':id/position')
  updatePosition(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePositionDto,
  ) {
    return this.playerService.updatePosition(id, dto.position);
  }

  /** 修炼 */
  @Post(':id/cultivate')
  async cultivate(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { qi_density: number },
  ) {
    return this.playerService.cultivate(id, body.qi_density || 0);
  }

  /** 突破 */
  @Post(':id/breakthrough')
  async breakthrough(@Param('id', ParseIntPipe) id: number) {
    return this.playerService.breakthrough(id);
  }

  /** 装配功法 */
  @Post(':id/technique/equip')
  async equipTechnique(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { techniqueId: number },
  ) {
    return this.playerService.equipTechnique(id, body.techniqueId);
  }

  /** 卸下功法 */
  @Post(':id/technique/unequip')
  async unequipTechnique(@Param('id', ParseIntPipe) id: number) {
    return this.playerService.unequipTechnique(id);
  }

  /** 功法突破（由前端小游戏汇总成功率 rate%） */
  @Post(':id/technique/breakthrough')
  async breakthroughTechnique(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { techniqueId: number; rate: number },
  ) {
    return this.playerService.breakthroughTechnique(id, body.techniqueId, body.rate);
  }

  /** 轻量状态查询：只返回 status + 中文 label，供前端轮询刷新快照（不全量拉取玩家数据） */
  @Get(':id/status')
  getStatus(@Param('id', ParseIntPipe) id: number) {
    return this.playerService.getStatus(id);
  }

  /** 部分更新玩家字段（如 hp, energy） */
  @Patch(':id')
  patch(
    @Param('id', ParseIntPipe) id: number,
    @Body() updates: Record<string, any>,
  ) {
    return this.playerService.patch(id, updates);
  }

}
