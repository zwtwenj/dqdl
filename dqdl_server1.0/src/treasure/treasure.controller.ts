import { Controller, Get, UseGuards } from '@nestjs/common';
import { TreasureService } from './treasure.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 宝物定义接口（只读）。
 * GET /api/treasure → 所有宝物定义（供前端缓存，tooltip 显示属性用）
 */
@Controller('treasure')
@UseGuards(JwtAuthGuard)
export class TreasureController {
  constructor(private readonly treasureService: TreasureService) {}

  @Get()
  async findAll() {
    return this.treasureService.findAll();
  }
}
