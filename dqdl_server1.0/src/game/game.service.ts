import { Injectable } from '@nestjs/common';
import { CharacterService } from '../character/character.service';
import { PlayerService } from '../player/player.service';
import { LocationService } from '../location/location.service';
import { Biz } from '../common/biz.exception';

/**
 * 游戏入口服务（网游模式）：创建角色 + 初始化 player。
 *
 * 地图为全局共享（LocationService 启动时初始化），不需要为每个角色生成地图。
 * 新角色创建后，player 初始位置设在地图根节点（斗气大陆）。
 */
@Injectable()
export class GameService {
  constructor(
    private readonly characterService: CharacterService,
    private readonly playerService: PlayerService,
    private readonly locationService: LocationService,
  ) {}

  /**
   * 创建新角色：建 character → 建 player（位置设为地图根节点）。
   * 全局地图已存在，无需生成。
   */
  async createCharacter(userId: number, name: string) {
    // 1. 创建角色
    const character = await this.characterService.create(userId, name)

    // 2. player 初始位置 = 地图根节点
    const root = await this.locationService.getRoot()
    const rootId = root?.id ?? 0

    // 3. 创建 player
    const playerRaw = await this.playerService.createForCharacter(character.id, name, rootId)
    // 返回聚合结果（含 final_attrs）
    const player = await this.playerService.findOne(playerRaw.id)

    return { character, player, rootLocationId: rootId || null }
  }

  /**
   * 进入已有角色：加载 player（聚合结果，含 final_attrs）。
   */
  async enterCharacter(userId: number, slot: number) {
    const character = await this.characterService.getBySlot(userId, slot)
    if (!character) throw Biz.notFound(`角色序号 ${slot} 不存在`)

    const player = await this.playerService.findByCharacterId(character.id)
    const root = await this.locationService.getRoot()

    return { character, player, rootLocationId: root?.id ?? null }
  }

  /**
   * 删除角色：级联删除 player + character。
   */
  async deleteCharacter(userId: number, slot: number) {
    const character = await this.characterService.getBySlot(userId, slot)
    if (!character) throw Biz.notFound(`角色序号 ${slot} 不存在`)
    await this.playerService.removeByCharacterId(character.id)
    await this.characterService.remove(userId, slot)
  }
}
