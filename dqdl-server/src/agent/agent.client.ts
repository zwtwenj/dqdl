import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * 统一的 dqdl-agent (Flask / DeepSeek) HTTP 客户端。
 *
 * 收口原本散落在 5 个文件（player / map-generator / training / dungeon / npc）
 * 中的 fetch 调用：
 *  - 统一从 ConfigService 读取 AGENT_URL（消除 player.service 直读 process.env）
 *  - 统一 JSON 请求/响应处理、统一错误日志与超时点位
 *  - 暴露按生成域命名的类型化方法
 *
 * 调用方仍各自负责领域降级（fallback 文本/蓝图），本类只负责传输。
 */
@Injectable()
export class AgentClient {
  private readonly logger = new Logger(AgentClient.name);
  private readonly baseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.baseUrl = (this.config.get<string>('AGENT_URL') || 'http://localhost:5000').replace(/\/+$/, '');
  }

  /** 低层 POST：返回解析后的 JSON。失败（网络错误或非 2xx）时抛出，由调用方 catch 走降级 */
  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const resp = await fetch(`${this.baseUrl}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!resp.ok) {
      throw new Error(`Agent ${path} 返回 ${resp.status}`);
    }
    return resp.json() as Promise<T>;
  }

  /** 地图子节点生成 → 返回 AI 生成的子地点原始数组 */
  generateMap(body: unknown): Promise<any[]> {
    return this.postJson<any[]>('/generate/map', body);
  }

  /** NPC 对话生成 → 返回 { reply, ... } */
  generateDialog(body: unknown): Promise<any> {
    return this.postJson('/generate/dialog', body);
  }

  /** 历练叙事生成 → 返回 { text, ... } */
  generateTraining(body: unknown): Promise<{ text?: string } & Record<string, any>> {
    return this.postJson('/generate/training', body);
  }

  /** 奇遇发现叙事生成 → 返回 { text, ... } */
  generateEncounter(body: unknown): Promise<{ text?: string } & Record<string, any>> {
    return this.postJson('/generate/encounter', body);
  }

  /** 突破叙事生成 → 返回 { text, ... } */
  generateBreakthrough(body: unknown): Promise<{ text?: string } & Record<string, any>> {
    return this.postJson('/generate/breakthrough', body);
  }

  /** 箱庭副本五幕蓝图生成 → 返回 { title, scene_type, intro, acts[] } */
  generateDungeon(body: unknown): Promise<any> {
    return this.postJson('/generate/dungeon', body);
  }

  /** 事件规格生成 → 返回 { event_id, title, nodes, delivery, fire_conditions, reason } */
  generateEvent(body: unknown): Promise<any> {
    return this.postJson('/generate/event', body);
  }

  /** RAG 语义检索 */
  ragSearch(body: unknown): Promise<any> {
    return this.postJson('/rag/search', body);
  }
}
