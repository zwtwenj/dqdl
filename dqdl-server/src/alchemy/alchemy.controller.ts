import { Controller, Get, Post, Body, Param, ParseIntPipe } from '@nestjs/common';
import { AlchemyService } from './alchemy.service';

@Controller('alchemy')
export class AlchemyController {
  constructor(private readonly alchemyService: AlchemyService) {}

  /** 丹方列表（标注已学习） */
  @Get('recipes/:playerId')
  recipes(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.alchemyService.listRecipes(playerId);
  }

  /** 可炼丹材料目录（带元素能量） */
  @Get('materials')
  materials() {
    return this.alchemyService.getMaterialCatalog();
  }

  /** 玩家丹炉信息 */
  @Get('furnaces/:playerId')
  furnaces(@Param('playerId', ParseIntPipe) playerId: number) {
    return this.alchemyService.listFurnaces(playerId);
  }

  /** 装备丹炉 */
  @Post('furnace/equip')
  equip(@Body() body: { player_id: number; item_id: string }) {
    return this.alchemyService.equipFurnace(Number(body.player_id), String(body.item_id));
  }

  /** 丹房商店 */
  @Get('shop')
  shop() {
    return this.alchemyService.getShop();
  }

  /** 购买（recipe=学习丹方 / item=草药或丹炉） */
  @Post('buy')
  buy(@Body() body: { player_id: number; kind: 'recipe' | 'item'; id: string }) {
    return this.alchemyService.buy(Number(body.player_id), body.kind, String(body.id));
  }

  /** 学习丹方 */
  @Post('recipe/learn')
  learn(@Body() body: { player_id: number; recipe_id: string }) {
    return this.alchemyService.learnRecipe(Number(body.player_id), String(body.recipe_id));
  }

  /** 炼丹 */
  @Post('attempt')
  attempt(
    @Body() body: { player_id: number; recipe_id: string; ingredients: { name: string; count: number }[] },
  ) {
    return this.alchemyService.attempt(
      Number(body.player_id),
      String(body.recipe_id),
      Array.isArray(body.ingredients) ? body.ingredients : [],
    );
  }
}
