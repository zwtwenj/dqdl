import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NpcService } from './npc.service';
import { CreateNpcDto } from './dto/npc.dto';

@Controller('npc')
export class NpcController {
  private readonly agentUrl: string;

  constructor(
    private readonly npcService: NpcService,
    private readonly config: ConfigService,
  ) {
    this.agentUrl = this.config.get<string>('AGENT_URL') || 'http://localhost:5000';
  }

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
    const npc = await this.npcService.findOne(id);
    if (!npc) return { reply: '此人已不在原地。' };

    const location = await this.npcService.getLocation(npc.location_id);

    const response = await fetch(`${this.agentUrl}/generate/dialog`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        npc: {
          name: npc.name,
          nature_name: npc.nature_name,
          nature_hint: npc.nature_hint,
          role_name: npc.role_name,
          role_hint: npc.role_hint,
        },
        location: {
          name: location?.name || '',
          loc_type: location?.loc_type || '',
          description: location?.description || '',
          tags: location?.tags || [],
        },
        player_input: body.message || '',
        history: body.history || [],
      }),
    });

    const data = await response.json() as any;
    return data;
  }
}
