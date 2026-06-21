import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { SkillService } from './skill.service';

@Controller('skill')
export class SkillController {
  constructor(private readonly skillService: SkillService) {}

  @Get()
  async findAll() {
    return this.skillService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    const skill = await this.skillService.findOne(id);
    if (!skill) return { error: '斗技不存在' };
    return {
      ...skill,
      scaling: this.skillService.parseScaling(skill.scaling),
      target_effects: this.skillService.parseEffects(skill.target_effects),
      self_effects: this.skillService.parseEffects(skill.self_effects),
    };
  }

  @Post()
  async create(@Body() body: any) {
    return this.skillService.create(body);
  }
}
