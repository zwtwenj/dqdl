import { Module } from '@nestjs/common';
import { MapDemoService } from './mapdemo.service';
import { MapDemoController } from './mapdemo.controller';

/**
 * 网状地图 DEMO 模块。
 * 自包含：内存数据、无 DB、无鉴权。仅用于验证 docs/map-graph-redesign.md 的概念。
 */
@Module({
  providers: [MapDemoService],
  controllers: [MapDemoController],
})
export class MapDemoModule {}
