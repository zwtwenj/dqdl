import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { NpcService } from './npc.service';
import { CreateNpcDto } from './dto/npc.dto';

@Controller('npc')
export class NpcController {
  constructor(private readonly npcService: NpcService) {}

  /** 查询某地点的 NPC */
  @Get('location/:locationId')
  async findByLocation(@Param('locationId') locationId: number) {
    // 先尝试生成（如果没有的话）
    await this.npcService.generateNpcsForLocation(locationId);
    return this.npcService.findByLocation(locationId);
  }

  /** 获取单个 NPC 详情 */
  @Get(':id')
  async findOne(@Param('id') id: number) {
    return this.npcService.findOne(id);
  }

  /** 手动创建 NPC */
  @Post()
  async create(@Body() dto: CreateNpcDto) {
    return this.npcService.create(dto);
  }

  /** 与 NPC 对话 */
  @Post(':id/talk')
  async talk(
    @Param('id') id: number,
    @Body() body: { message: string; history: any[] },
  ) {
    return this.npcService.talk(id, body.message, body.history);
  }
}
