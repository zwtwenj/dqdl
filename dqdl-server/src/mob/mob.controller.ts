import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { MobService } from './mob.service';

@Controller('mob')
export class MobController {
  constructor(private readonly mobService: MobService) {}

  @Get()
  async findAll() {
    return this.mobService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    return this.mobService.findOne(id);
  }

  @Get('mob-id/:mobId')
  async findByMobId(@Param('mobId') mobId: string) {
    return this.mobService.findByMobId(mobId);
  }

  /** 查找或创建单条 */
  @Post('ensure')
  async ensure(@Body() body: { mob_id: string; description?: string }) {
    return this.mobService.findOrCreate(body.mob_id, body.description);
  }

  /** 批量查找或创建 */
  @Post('ensure-batch')
  async ensureBatch(
    @Body() body: { items: { mob_id: string; description?: string }[] },
  ) {
    return this.mobService.findOrCreateBatch(body.items || []);
  }
}
