import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { TechniqueService } from './technique.service';

@Controller('technique')
export class TechniqueController {
  constructor(private readonly techniqueService: TechniqueService) {}

  @Get()
  async findAll() {
    return this.techniqueService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    const tech = await this.techniqueService.findOne(id);
    if (!tech) return { error: '功法不存在' };
    return {
      ...tech,
      base: this.techniqueService.parseBase(tech.base),
    };
  }

  @Post()
  async create(@Body() body: any) {
    return this.techniqueService.create(body);
  }
}
