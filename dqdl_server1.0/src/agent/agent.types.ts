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
  /** npc_role.id（可选）；agent 据此按职能限定 NPC 的知识库来源（如炼药师只能查草药/丹药图鉴） */
  role_id?: number;
}

/** NPC 对话响应（agent /generate/dialog 返回） */
export interface AgentDialogResult {
  reply: string;
  /** agent_dialog_call.id（agent 侧调用记录 id） */
  call_id: number | null;
}

/** 网状地图单节点生成请求（location_net 专用，调 /generate/map-node） */
export interface AgentMapNodeRequest {
  /** server 已定的类型：wild/city/sect/secret */
  loc_type: string;
  /** 周边已知地点（供 LLM 保持地理连贯、避免重名） */
  parent_context?: { name: string; loc_type: string; direction?: string }[];
  /** 已有地名（避免重名） */
  existingNames?: string[];
}

/** 网状地图单节点生成结果（字段对齐 LocationNet 实体） */
export interface AgentMapNodeResult {
  name: string;
  loc_type: string;
  description: string;
  danger_level: number;
  qi_density: number;
  tags: string[] | null;
  available_actions: string[] | null;
  common_mobs: { mob_id: string; name: string }[] | null;
  seed?: string;
}

/** 网状地图批量生成请求（一次 LLM 调用生成多个节点） */
export interface AgentMapNodesRequest {
  /** server 已定的每个空位类型 + 坐标 */
  nodes: { loc_type: string; gx: number; gy: number }[];
  /** 周边已知地点 */
  parent_context?: { name: string; loc_type: string; direction?: string }[];
  /** 已有地名 */
  existingNames?: string[];
}

/** 批量生成结果（每个含 gx,gy，与请求对齐） */
export interface AgentMapNodesResultItem extends AgentMapNodeResult {
  gx: number;
  gy: number;
}

/** NPC 生成请求（调 /generate/npc）：按场景+职能生成一个 NPC 的基础设定 */
export interface AgentNpcRequest {
  scene_name: string;
  scene_type: string;
  role_name: string;
  role_hint: string;
  city_name?: string;
}

/** NPC 生成结果；字段可能为空字符串（agent 失败/未返回时），由 server 兜底随机补齐 */
export interface AgentNpcResult {
  name: string;
  gender: string; // '男' | '女'
  age: string; // 少年/青年/中年/老年
  nature: string; // 性格名（须对齐 nature 表）
}

