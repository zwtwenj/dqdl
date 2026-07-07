import { Controller, Get, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { LocationService } from './location.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 地点接口（网游模式）：全局地图，所有角色共享。
 * 不再需要 saveId 参数。
 */
@Controller('location')
@UseGuards(JwtAuthGuard)
export class LocationController {
  constructor(private readonly locationService: LocationService) {}

  /** 获取地图根节点（斗气大陆） GET /api/location/root */
  @Get('root')
  root() {
    return this.locationService.getRoot()
  }

  /** 获取某地点的子节点 GET /api/location/:locationId/children */
  @Get(':locationId/children')
  children(@Param('locationId', ParseIntPipe) locationId: number) {
    return this.locationService.getChildren(locationId)
  }

  /** 获取单个地点详情 GET /api/location/:locationId */
  @Get(':locationId')
  one(@Param('locationId', ParseIntPipe) locationId: number) {
    return this.locationService.findOne(locationId)
  }
}
