// 共享常量与纯函数（角色面板/战斗/副本等多处复用）

export const attrLabels = {
  power: '力量', intelligence: '智力', quick: '敏捷', stamina: '体质',
  hp: '生命', lucky: '运气', energy: '斗气',
}

export const baseAttrKeys = ['power', 'intelligence', 'quick', 'stamina', 'lucky']

/** 等阶名称：1-9 斗之气段，11-19 斗者星，21-29 斗师星，31+ 大斗师星 */
export function levelName(lv) {
  if (lv <= 9) return '斗之气 ' + '一二三四五六七八九'[lv - 1] + '段'
  if (lv <= 19) return '斗者 ' + '一二三四五六七八九'[lv - 11] + '星'
  if (lv <= 29) return '斗师 ' + '一二三四五六七八九'[lv - 21] + '星'
  return '大斗师 ' + '一二三四五六七八九'[lv - 31] + '星'
}
