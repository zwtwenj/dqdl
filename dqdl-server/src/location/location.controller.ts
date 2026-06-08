import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Body,
  Query,
} from '@nestjs/common';
import { LocationService } from './location.service';
import { TrainingService } from './training.service';
import { CreateLocationDto, ExpandLocationDto } from './dto/location.dto';

@Controller('location')
export class LocationController {
  constructor(
    private readonly locationService: LocationService,
    private readonly trainingService: TrainingService,
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
}
