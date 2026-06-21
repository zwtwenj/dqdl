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

}
