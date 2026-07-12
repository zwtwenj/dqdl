import { Injectable } from '@nestjs/common';
import { CharacterService } from '../character/character.service';
import { PlayerService } from '../player/player.service';
import { LocationService } from '../location/location.service';
import { LocationNetService } from '../location_net/location-net.service';
import { Biz } from '../common/biz.exception';

/**
 * 游戏入口服务（网游模式）：创建角色 + 初始化 player。
 *
 * 地图已切换为 location_net 网状系统（旧 location 树保留但不再用于玩家位置）。
 * 新角色初始位置 = 乌坦城（location_net 起点 gx=0,gy=0）。
 * 老玩家进游戏时兜底迁移：若 location_id 不在 location_net 表中，改为乌坦城。
 */
@Injectable()
export class GameService {
  constructor(
    private readonly characterService: CharacterService,
    private readonly playerService: PlayerService,
    private readonly locationService: LocationService,
    private readonly locationNetService: LocationNetService,
  ) {}

  /**
   * 创建新角色：建 character → 建 player（位置设为乌坦城，location_net 起点）。
   */
  async createCharacter(userId: number, name: string) {
    // 1. 创建角色
    const character = await this.characterService.create(userId, name)

    // 2. player 初始位置 = 乌坦城（location_net 起点）
    const startId = await this.locationNetService.getStartNodeId()

    // 3. 创建 player
    const playerRaw = await this.playerService.createForCharacter(character.id, name, startId)
    // 返回聚合结果（含 final_attrs）
    const player = await this.playerService.findOne(playerRaw.id)

    return { character, player, rootLocationId: startId }
  }

  /**
   * 进入已有角色：加载 player（聚合结果，含 final_attrs）。
   * 兜底迁移：若玩家 location_id 不在 location_net 表中（指向旧 location 树或为 null），
   *          自动迁移到乌坦城，保证老玩家也能进新地图。
   */
  async enterCharacter(userId: number, slot: number) {
    const character = await this.characterService.getBySlot(userId, slot)
    if (!character) throw Biz.notFound(`角色序号 ${slot} 不存在`)

    const player = await this.playerService.findByCharacterId(character.id)

    // 兜底迁移：检查 location_id 是否在 location_net 表中
    if (player) {
      const needsMigrate =
        player.location_id == null ||
        (await this.locationNetService.getNode(player.location_id)) == null
      if (needsMigrate) {
        const startId = await this.locationNetService.getStartNodeId()
        await this.playerService.moveToLocation(player.id, startId)
        // 重新拉取聚合结果
        const migrated = await this.playerService.findByCharacterId(character.id)
        return { character, player: migrated, rootLocationId: startId }
      }
    }

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
