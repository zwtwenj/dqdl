import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ShopService } from './shop.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PlayerService } from '../player/player.service';

/**
 * 商店接口：商品查询 + 买/卖。
 * 买/卖返回更新后的 money（前端 store 同步，无需单独 money 接口）。
 */
@Controller('shop')
@UseGuards(JwtAuthGuard)
export class ShopController {
  constructor(
    private readonly shopService: ShopService,
    private readonly playerService: PlayerService,
  ) {}

  /** 按 NPC 查商品列表 GET /api/shop/npc/:npcId → { npcName, roleId, items } */
  @Get('npc/:npcId')
  shopByNpc(@Param('npcId', ParseIntPipe) npcId: number) {
    return this.shopService.getShopByNpc(npcId);
  }

  /** 购买 POST /api/shop/buy { playerId, itemId, count } → { money } */
  @Post('buy')
  async buy(
    @Body() body: { playerId: number; itemId: string; count: number },
    @Req() req: any,
  ) {
    this.playerService.verifyOwnership(body.playerId, req.user.id);
    return this.shopService.buy(
      body.playerId,
      body.itemId,
      Number(body.count),
    );
  }

  /** 出售 POST /api/shop/sell { playerId, itemId, count } → { money, remaining } */
  @Post('sell')
  async sell(
    @Body() body: { playerId: number; itemId: string; count: number },
    @Req() req: any,
  ) {
    this.playerService.verifyOwnership(body.playerId, req.user.id);
    return this.shopService.sell(
      body.playerId,
      body.itemId,
      Number(body.count),
    );
  }
}
