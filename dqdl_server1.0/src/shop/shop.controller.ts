import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  UseGuards,
} from '@nestjs/common';
import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 商店接口：商品查询（购买/出售暂未实现）。
 */
@Controller('shop')
@UseGuards(JwtAuthGuard)
export class ShopController {
  constructor(private readonly shopService: ShopService) {}

  /** 按 NPC 查商品列表 GET /api/shop/npc/:npcId → { npcName, roleId, items } */
  @Get('npc/:npcId')
  shopByNpc(@Param('npcId', ParseIntPipe) npcId: number) {
    return this.shopService.getShopByNpc(npcId);
  }
}
