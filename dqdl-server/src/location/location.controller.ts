import {
  Controller,
  Get,
  Post,
  Param,
  ParseIntPipe,
  Body,
} from '@nestjs/common';
import { LocationService } from './location.service';
import { CreateLocationDto, ExpandLocationDto } from './dto/location.dto';

/**
 * 地点控制器（阶段 1.3 后仅保留地点树相关路由）。
 * 历练路由 training / training/stream 已迁移到 TrainingController（/training）。
 */
@Controller('location')
export class LocationController {
  constructor(
    private readonly locationService: LocationService,
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
}
