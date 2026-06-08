import { Controller, Get, Param, Post, Body } from '@nestjs/common';
import { ItemService } from './item.service';
import { CreateItemDto } from './dto/create-item.dto';

@Controller('item')
export class ItemController {
  constructor(private readonly itemService: ItemService) {}

  @Get()
  async findAll() {
    return this.itemService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: number) {
    return this.itemService.findOne(id);
  }

  @Post()
  async create(@Body() dto: CreateItemDto) {
    return this.itemService.create(dto);
  }
}
