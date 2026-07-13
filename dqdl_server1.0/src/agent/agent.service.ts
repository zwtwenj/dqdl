import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { AxiosError } from 'axios';
import type {
  AgentMapParent,
  AgentMapRule,
  AgentMapResult,
  AgentDialogBody,
  AgentDialogResult,
  AgentMapNodeRequest,
  AgentMapNodeResult,
  AgentMapNodesRequest,
  AgentMapNodesResultItem,
} from './agent.types';

/**
 * Agent 客户端服务：封装对旧 dqdl-agent (Python Flask :5000) 的 HTTP 调用。
 * 目前仅实现 generateMap（生成地图子节点），后续可扩展对话/奇遇等。
 *
 * 失败时返回 null，由调用方（LocationService）走 fallback 降级方案。
 * AGENT_URL 从 .env 读取，默认 http://localhost:5000。
 */
@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);
  private readonly baseUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly http: HttpService,
  ) {
    this.baseUrl = this.config.get<string>('AGENT_URL') || 'http://localhost:5000';
  }

  /** 健康检查 */
  async health(): Promise<boolean> {
    try {
      const { status } = await firstValueFrom(this.http.get(`${this.baseUrl}/health`));
      return status === 200;
    } catch {
      return false;
    }
  }

  /**
   * 生成地图子节点：调 POST /generate/map。
   * @param parent  父地点信息
   * @param rule    生成规则（来自 location_gen_rule 表）
   * @param count   期望生成数量
   * @param existingNames 已有子节点名（避免重名）
   * @returns 生成结果数组；agent 不可用或出错时返回 null
   */
  async generateMap(
    parent: AgentMapParent,
    rule: AgentMapRule,
    count: number,
    existingNames: string[],
  ): Promise<AgentMapResult[] | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<AgentMapResult[]>(`${this.baseUrl}/generate/map`, {
          parent,
          rule,
          count,
          existingNames,
          seed: null,
        }),
      );
      if (!Array.isArray(data)) {
        this.logger.warn('agent /generate/map 返回非数组，已忽略');
        return null;
      }
      return data;
    } catch (e) {
      const err = e as AxiosError;
      this.logger.warn(
        `agent /generate/map 调用失败：${err.message}（code=${err.code}, status=${err.response?.status}）`,
      );
      return null;
    }
  }

  /**
   * 生成网状地图单个节点：调 POST /generate/map-node（location_net 专用）。
   * server 已定 loc_type，agent 只负责生成名称/描述/文案。
   * @param req { loc_type, parent_context?, existingNames? }
   * @returns 单节点结果；agent 不可用或超时返回 null（调用方走名称池 fallback）
   *
   * 注意：每次调用都会真实请求 DeepSeek。调用方应并发（Promise.all）+ 设超时。
   * 这里给 http 请求设了 15s 超时，避免单个慢请求拖住整批。
   */
  async generateMapNode(req: AgentMapNodeRequest): Promise<AgentMapNodeResult | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<AgentMapNodeResult>(
          `${this.baseUrl}/generate/map-node`,
          req,
          { timeout: 15000 },
        ),
      );
      if (!data || typeof data !== 'object' || !data.name) {
        this.logger.warn('agent /generate/map-node 返回无效数据，已忽略');
        return null;
      }
      return data;
    } catch (e) {
      const err = e as AxiosError;
      this.logger.warn(
        `agent /generate/map-node 调用失败：${err.message}（code=${err.code}, status=${err.response?.status}）`,
      );
      return null;
    }
  }

  /**
   * 批量生成网状地图节点：调 POST /generate/map-nodes（一次 LLM 调用出多个节点）。
   * 在同一 prompt 内生成，天然保证本批内部不重名，且能避开已存在地名。
   * @param req { nodes: [{loc_type, gx, gy}], parent_context?, existingNames? }
   * @returns 节点数组（含 gx,gy，与请求对齐）；agent 失败返回 null（调用方走 fallback）
   */
  async generateMapNodes(req: AgentMapNodesRequest): Promise<AgentMapNodesResultItem[] | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<AgentMapNodesResultItem[]>(
          `${this.baseUrl}/generate/map-nodes`,
          req,
          { timeout: 30000 },
        ),
      );
      if (!Array.isArray(data) || data.length === 0) {
        this.logger.warn('agent /generate/map-nodes 返回非数组或空，已忽略');
        return null;
      }
      return data;
    } catch (e) {
      const err = e as AxiosError;
      this.logger.warn(
        `agent /generate/map-nodes 调用失败：${err.message}（code=${err.code}, status=${err.response?.status}）`,
      );
      return null;
    }
  }

  /**
   * 生成历练叙事：调 POST /generate/training。
   * @param player  玩家信息 { name, technique_name }
   * @param mob     魔兽信息 { mob_id, name, description, ... }
   * @param location 地点信息 { name, description }
   * @param won     是否胜利
   * @returns { text, keywords:[{text,type}] }；agent 不可用或出错时返回 null
   */
  async generateTraining(
    player: { name: string; technique_name?: string; equipped_skills?: string[] },
    mob: { mob_id: string; name: string; description?: string },
    location: { name: string; description?: string },
    won: boolean,
  ): Promise<{ text: string; keywords: { text: string; type: string }[] } | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<{ text: string; keywords?: { text: string; type: string }[] }>(
          `${this.baseUrl}/generate/training`,
          {
            player,
            mob,
            battle: { style: '普通', won },
            location,
            won,
          },
        ),
      );
      if (!data?.text) return null;
      return {
        text: data.text,
        keywords: Array.isArray(data.keywords) ? data.keywords : [],
      };
    } catch (e) {
      const err = e as AxiosError;
      this.logger.warn(
        `agent /generate/training 调用失败：${err.message}（code=${err.code}）`,
      );
      return null;
    }
  }

  /**
   * 生成奇遇发现叙事：调 POST /generate/encounter。
   * 只描述"发现"这处奇遇（秘境入口/洞天福地），不写进入或战斗。
   * @param player     玩家信息 { name, technique_name }
   * @param location   地点信息 { name, description }
   * @param encounter  奇遇信息 { kind, title, scene_type, star, description }
   * @returns 叙事文本；agent 不可用或出错时返回 null（调用方用 encounter.description 兜底）
   */
  async generateEncounter(
    player: { name: string; technique_name?: string },
    location: { name: string; description?: string },
    encounter: {
      kind: string;
      title: string;
      scene_type?: string;
      star?: number | null;
      description: string;
    },
  ): Promise<string | null> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<{ text: string }>(
          `${this.baseUrl}/generate/encounter`,
          { player, location, encounter },
        ),
      );
      return data?.text || null;
    } catch (e) {
      const err = e as AxiosError;
      this.logger.warn(
        `agent /generate/encounter 调用失败：${err.message}（code=${err.code}）`,
      );
      return null;
    }
  }

  /**
   * 生成 NPC 对话：调 POST /generate/dialog。
   * 上下文（npc/player/location/history）由 NpcService 后端组装，
   * session_id/call_index 透传给 agent，agent 据此落 agent_dialog_call。
   * 失败时降级返回固定台词 + call_id=null，不抛异常（对话不应因 agent 故障中断）。
   */
  async generateDialog(body: AgentDialogBody): Promise<AgentDialogResult> {
    try {
      const { data } = await firstValueFrom(
        this.http.post<AgentDialogResult>(`${this.baseUrl}/generate/dialog`, body),
      );
      return {
        reply: data?.reply || '......（对方似乎没有听懂你在说什么）',
        call_id: data?.call_id ?? null,
      };
    } catch (e) {
      const err = e as AxiosError;
      this.logger.warn(
        `agent /generate/dialog 调用失败：${err.message}（code=${err.code}）`,
      );
      return { reply: '......（对方似乎没有听懂你在说什么）', call_id: null };
    }
  }
}
