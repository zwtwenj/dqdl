import { Injectable } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CharacterService } from '../character/character.service';
import { PlayerService } from '../player/player.service';
import { LocationService } from '../location/location.service';
import { LocationNetService } from '../location_net/location-net.service';
import { CultivationService } from '../cultivation/cultivation.service';
import { ScriptTriggerService } from '../script/script-trigger.service';
import { MoveSessionService } from '../move/move-session.service';
import { Biz } from '../common/biz.exception';
import { SCRIPT_HOOK_EVENT } from '../script/script.constants';

/**
 * 游戏入口服务（网游模式）：创建角色 + 初始化 player + 进入游戏时恢复进行中事件。
 *
 * 地图已切换为 location_net 网状系统（旧 location 树保留但不再用于玩家位置）。
 * 新角色初始位置 = 乌坦城（location_net 起点 gx=0,gy=0）。
 * 老玩家进游戏时兜底迁移：若 location_id 不在 location_net 表中，改为乌坦城。
 *
 * 进入游戏（enterCharacter）时聚合「进行中事件」(pending_states)：
 *   - 剧本演出（script_instance status=playing）
 *   - 修炼（cultivation active 会话，调 resume 补算离线收益）
 * 前端按事件 type 分发恢复。新增事件类型只需在此聚合，无需新增接口。
 */
@Injectable()
export class GameService {
  constructor(
    private readonly characterService: CharacterService,
    private readonly playerService: PlayerService,
    private readonly locationService: LocationService,
    private readonly locationNetService: LocationNetService,
    private readonly cultivationService: CultivationService,
    private readonly scriptTrigger: ScriptTriggerService,
    private readonly moveService: MoveSessionService,
    private readonly eventEmitter: EventEmitter2,
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
    let rootLocationId: number | null = null
    let finalPlayer = player
    if (player) {
      const needsMigrate =
        player.location_id == null ||
        (await this.locationNetService.getNode(player.location_id)) == null
      if (needsMigrate) {
        const startId = await this.locationNetService.getStartNodeId()
        await this.playerService.moveToLocation(player.id, startId)
        // 重新拉取聚合结果
        finalPlayer = await this.playerService.findByCharacterId(character.id)
        rootLocationId = startId
      }
    }
    if (rootLocationId == null) {
      const root = await this.locationService.getRoot()
      rootLocationId = root?.id ?? null
    }

    // 剧本钩子：进入游戏后触发（选角进入主界面）。fire-and-forget。
    if (finalPlayer) {
      this.eventEmitter.emit(SCRIPT_HOOK_EVENT, {
        hook: 'enter_game',
        playerId: finalPlayer.id,
        context: [
          { type: 'player', data: { id: finalPlayer.id, level: finalPlayer.level, money: finalPlayer.money } },
        ],
      })
    }

    // 聚合「进行中事件」(pending_states)：玩家刷新/重连后需要恢复的所有事件。
    // 新增事件类型只需在此加一段，前端按 type 分发，无需新增接口。
    const pendingStates = await this.collectPendingStates(finalPlayer?.id);

    return { character, player: finalPlayer, rootLocationId, pending_states: pendingStates }
  }

  /**
   * 查询玩家进行中的事件（供刷新页面场景的独立接口用）。
   * 复用 collectPendingStates 逻辑，与 enterCharacter 返回的 pending_states 一致。
   */
  async getPendingStates(playerId: number): Promise<Array<{ type: string; data: any }>> {
    return this.collectPendingStates(playerId);
  }

  /**
   * 聚合玩家进行中的所有事件，返回统一格式 [{type, data}]。
   * 每种事件类型独立 try/catch，互不影响（一种失败不阻断其它恢复）。
   *
   * 位置校验：剧本事件恢复前，检查玩家当前位置是否和事件当前节点的 location 一致。
   *   - 一致：返回事件（玩家还在演出地点，可继续）
   *   - 不一致：不返回（玩家已离开，事件无法继续；后续可加自动结束/迁移逻辑）
   */
  private async collectPendingStates(playerId: number | undefined): Promise<Array<{ type: string; data: any }>> {
    if (!playerId) return [];
    const states: Array<{ type: string; data: any }> = [];

    // 玩家当前位置（用于剧本位置校验）
    const playerEntity = await this.playerService.getEntity(playerId);

    // 1. 剧本演出：查 status=playing 的实例，校验玩家位置与当前节点 location 一致
    try {
      const scriptState = await this.scriptTrigger.findPlayingByPlayer(playerId);
      if (scriptState && playerEntity) {
        // 查当前节点的 location 映射，比对玩家位置
        const nodeInfo = await this.scriptTrigger.getCurrentNode(scriptState.instance_id, playerId).catch(() => null);
        if (nodeInfo && this.isPlayerAtNodeLocation(playerEntity, nodeInfo.location)) {
          states.push({ type: 'script', data: scriptState });
        }
        // 位置不匹配：不返回（玩家已离开演出地点）
      }
    } catch (e) {
      // 剧本恢复失败不阻断其它
    }

    // 2. 修炼：调 resume 补算离线收益（有 active 会话才返回非 null）
    try {
      const resumed = await this.cultivationService.resume(playerId);
      if (resumed) {
        const session = await this.cultivationService.getCurrent(playerId);
        states.push({ type: 'cultivation', data: { resume: resumed, session } });
      }
    } catch (e) {
      // 修炼恢复失败不阻断其它
    }

    // 3. 移动：查 active move_session（getActiveSession 内含 lazy arrive）
    try {
      const moveSession = await this.moveService.getActiveSession(playerId);
      if (moveSession) {
        states.push({ type: 'move', data: moveSession });
      }
    } catch (e) {
      // 移动恢复失败不阻断其它
    }

    return states;
  }

  /**
   * 校验玩家当前位置是否和剧本节点 location 一致。
   * 节点 location 是映射后的 {type:'location_scene'|'location_net', id}。
   *   - location_scene：玩家 scene_id 须等于 id
   *   - location_net：玩家 location_id 须等于 id（且不在场景里）
   */
  private isPlayerAtNodeLocation(player: any, nodeLocation: { type: string; id: number } | null): boolean {
    if (!nodeLocation) return false;
    if (nodeLocation.type === 'location_scene') {
      return player.scene_id === nodeLocation.id;
    }
    if (nodeLocation.type === 'location_net') {
      // 玩家须在该节点且不在场景里
      return player.location_id === nodeLocation.id && player.scene_id == null;
    }
    return false;
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
