import { Controller, Get, Post, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AlchemyService } from './alchemy.service';
import { PlayerService } from '../player/player.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

/**
 * 炼丹接口（移植自老版本）。
 * GET  /api/alchemy/recipes        丹方列表
 * GET  /api/alchemy/materials      材料目录
 * GET  /api/alchemy/furnaces       玩家丹炉
 * POST /api/alchemy/furnace/equip  装备丹炉
 * GET  /api/alchemy/shop           丹房商店
 * POST /api/alchemy/buy            购买
 * POST /api/alchemy/recipe/learn   学习丹方
 * POST /api/alchemy/attempt        炼丹
 */
@Controller('alchemy')
@UseGuards(JwtAuthGuard)
export class AlchemyController {
  constructor(
    private readonly alchemyService: AlchemyService,
    private readonly playerService: PlayerService,
  ) {}

  private async pid(req: any): Promise<number> {
    return (await this.playerService.verifyOwnershipByUser(req.user.id)).id;
  }

  @Get('recipes')
  async recipes(@Req() req: any) { return this.alchemyService.listRecipes(await this.pid(req)); }

  @Get('materials')
  async materials() { return this.alchemyService.getMaterialCatalog(); }

  @Get('furnaces')
  async furnaces(@Req() req: any) { return this.alchemyService.listFurnaces(await this.pid(req)); }

  @Post('furnace/equip')
  async equipFurnace(@Req() req: any, @Body() body: { item_id: string }) {
    return this.alchemyService.equipFurnace(await this.pid(req), body.item_id);
  }

  @Get('shop')
  async shop() { return this.alchemyService.getShop(); }

  @Post('buy')
  async buy(@Req() req: any, @Body() body: { kind: string; id: string }) {
    return this.alchemyService.buy(await this.pid(req), body.kind as 'recipe' | 'item', body.id);
  }

  @Post('recipe/learn')
  async learn(@Req() req: any, @Body() body: { recipe_id: string }) {
    return this.alchemyService.learnRecipe(await this.pid(req), body.recipe_id);
  }

  @Post('attempt')
  async attempt(@Req() req: any, @Body() body: { recipe_id: string; ingredients: Array<{ item_id: string; count: number }> }) {
    return this.alchemyService.attempt(await this.pid(req), body.recipe_id, body.ingredients);
  }
}
