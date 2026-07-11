/**
 * Agent 服务相关类型定义。
 * 对应旧 dqdl-agent (Python Flask :5000) 的 /generate/map 接口契约。
 */

/** 父地点信息（传给 agent 的 parent 参数） */
export interface AgentMapParent {
  id: number;
  name: string;
  loc_type: string;
  description: string | null;
  depth: number;
  [key: string]: any;
}

/** 生成规则（传给 agent 的 rule 参数，来自 location_gen_rule 表） */
export interface AgentMapRule {
  depth: number;
  loc_type: string;
  min_children: number;
  max_children: number;
  naming_style: string;
  danger_range: string;
  world_constraints: string;
  gen_prompt: string;
  [key: string]: any;
}

/** agent 返回的单个生成结果 */
export interface AgentMapResult {
  name: string;
  loc_type: string;
  description: string;
  danger_level: number;
  qi_density: number;
  available_actions: string[] | null;
  tags: string[] | null;
  common_mobs: { mob_id: string; name: string }[] | null;
  common_herbs?: { item_id: string; name: string }[] | null;
  seed?: string;
}

/** NPC 对话请求体（传给 agent /generate/dialog） */
export interface AgentDialogBody {
  npc: {
    name: string;
    nature_name: string;
    nature_hint: string;
    role_name: string;
    role_hint: string;
  };
  location: {
    name: string;
    loc_type: string;
    description: string;
    tags: string[];
  };
  player: {
    name: string;
    level: number;
  };
  player_input: string;
  history: { player: string; npc: string }[];
  /** server 的 dialog_session.id（跨服务绑定键，agent 据此落 agent_dialog_call） */
  session_id: number;
  /** 会话内第几次调用（1=开场白） */
  call_index: number;
}

/** NPC 对话响应（agent /generate/dialog 返回） */
export interface AgentDialogResult {
  reply: string;
  /** agent_dialog_call.id（agent 侧调用记录 id） */
  call_id: number | null;
}

