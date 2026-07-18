/**
 * 通用条件引擎（纯函数）—— 剧本触发的条件比对。
 *
 * 设计：触发条件按「type」分组，每个 type 下是「字段→操作符条件」映射。
 *   conditions = {
 *     player: { level: {op:'>=', val:6}, money: {op:'>=', val:10000} },
 *     location: { loc_type: {op:'==', val:'wild'} },
 *   }
 *   context   = [ {type:'player', data:{id,level,money,...}}, {type:'location', data:{loc_type,...}} ]
 *
 * 比对规则：
 *   - 按 type 从 context 里找 data；找不到该 type → 条件不满足
 *   - 每个 type 内逐字段比对，全部满足才算该 type 满足
 *   - 所有 type 都满足 → 整体满足
 *
 * op 操作符：
 *   > >= < <= == !=    数字/字符串通用（按 JS 原生比较）
 *   in                 val 须为数组，actual ∈ val
 *
 * 容错：非法 op / 类型不匹配 / 字段缺失 → 该字段判 false（条件不满足），不抛异常。
 * 这样配置错误最多是「剧本不触发」，不会让主业务报错。
 */

/** 单个字段的条件：{op, val} */
export interface FieldCondition {
  op: string;
  val: any;
}

/** 一个 type 下的字段条件集合：{fieldName: {op, val}} */
export type TypeCondition = Record<string, FieldCondition>;

/** 整体条件：{typeName: TypeCondition}，如 {player:{...}, location:{...}} */
export type Conditions = Record<string, TypeCondition>;

/** 钩子上下文的一项：{type, data} */
export interface ContextEntry {
  type: string;
  data: Record<string, any>;
}

/**
 * 比对单个字段条件。
 * @returns true=满足；false=不满足（含非法 op/类型不匹配等容错情况）
 */
export function matchField(cond: FieldCondition, actual: any): boolean {
  const { op, val } = cond || {};
  try {
    switch (op) {
      case '>':
        return actual > val;
      case '>=':
        return actual >= val;
      case '<':
        return actual < val;
      case '<=':
        return actual <= val;
      case '==':
        // 宽松相等（==）：允许 6 == '6' 这类，贴近配置直觉
        return actual == val; // eslint-disable-line eqeqeq
      case '!=':
        return actual != val; // eslint-disable-line eqeqeq
      case 'in':
        // val 须为数组；actual 属于 val 即满足
        return Array.isArray(val) && val.includes(actual);
      default:
        // 未知 op → 视为不满足（容错）
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * 比对一个 type 下的所有字段条件。
 * @param typeCond  {field: {op,val}}
 * @param data      该 type 对应的实际数据
 * @returns 全部字段满足才 true；data 缺失或字段不存在 → false
 */
export function matchType(typeCond: TypeCondition, data: Record<string, any> | undefined): boolean {
  if (!typeCond || typeof typeCond !== 'object') return true; // 空 type 条件视为满足
  if (!data || typeof data !== 'object') return false; // 有条件但无数据 → 不满足
  for (const [field, cond] of Object.entries(typeCond)) {
    const actual = data[field];
    if (!matchField(cond as FieldCondition, actual)) {
      return false;
    }
  }
  return true;
}

/**
 * 比对整个触发条件。
 * @param conditions {type: {field: {op,val}}}
 * @param context    [{type, data}]
 * @returns 所有 type 都满足才 true；conditions 为空对象/NULL → 视为无条件满足（仅按概率）
 */
export function matchConditions(
  conditions: Conditions | null | undefined,
  context: ContextEntry[],
): boolean {
  // 无条件 → 直接满足（仅靠概率掘骰）
  if (!conditions || typeof conditions !== 'object' || Object.keys(conditions).length === 0) {
    return true;
  }
  // 按 type 索引 context
  const ctxMap = new Map<string, Record<string, any>>();
  for (const entry of context || []) {
    if (entry && entry.type) ctxMap.set(entry.type, entry.data || {});
  }
  // 每个 type 都要满足
  for (const [type, typeCond] of Object.entries(conditions)) {
    const data = ctxMap.get(type);
    if (!matchType(typeCond as TypeCondition, data)) {
      return false;
    }
  }
  return true;
}
