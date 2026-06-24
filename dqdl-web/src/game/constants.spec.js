import { describe, it, expect } from 'vitest'
import { levelName, attrLabels, baseAttrKeys } from './constants'

/** 冻结等阶名称：阶段 2 重构中多处组件/store 复用，行为不可变。 */
describe('levelName (行为冻结)', () => {
  it('斗之气 1-9 段', () => {
    expect(levelName(1)).toBe('斗之气 一段')
    expect(levelName(9)).toBe('斗之气 九段')
  })
  it('斗者 11-19 星', () => {
    expect(levelName(11)).toBe('斗者 一星')
    expect(levelName(19)).toBe('斗者 九星')
  })
  it('斗师 21-29 星', () => {
    expect(levelName(21)).toBe('斗师 一星')
    expect(levelName(29)).toBe('斗师 九星')
  })
  it('大斗师 31+ 星', () => {
    expect(levelName(31)).toBe('大斗师 一星')
    expect(levelName(39)).toBe('大斗师 九星')
  })
})

describe('常量映射', () => {
  it('attrLabels 覆盖核心属性', () => {
    expect(attrLabels.power).toBe('力量')
    expect(attrLabels.hp).toBe('生命')
    expect(attrLabels.energy).toBe('斗气')
  })
  it('baseAttrKeys 顺序固定', () => {
    expect(baseAttrKeys).toEqual(['power', 'intelligence', 'quick', 'stamina', 'lucky'])
  })
})
