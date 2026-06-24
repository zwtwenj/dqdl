import { Controller, Get, Param, Post, Body, ParseIntPipe } from '@nestjs/common';
import { BuffService } from './buff.service';

@Controller('buff')
export class BuffController {
  constructor(private readonly buffService: BuffService) {}

  @Get()
  async findAll() {
    return this.buffService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.buffService.findOne(id);
  }

  @Post()
  async create(@Body() body: any) {
    return this.buffService.create(body);
  }
}
