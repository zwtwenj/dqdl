-- ========== item 表加 stackable（是否可堆叠）字段 ==========
-- 默认 true（可堆叠）：丹药/材料等同类物品可叠在同一格。
-- 宝物（type='宝物'）一律 false：每件宝物独占一格，卸下/获得不与已有同类合并。
-- 与项目其他 migration 一致：裸 ALTER，靠"执行一次"保证幂等，勿重复跑。

ALTER TABLE `item`
  ADD COLUMN `stackable` TINYINT NOT NULL DEFAULT 1 COMMENT '是否可堆叠：1=可堆叠(丹药/材料等) 0=不可堆叠(宝物每件独占一格)' AFTER `usable`;

-- 宝物全部设为不可堆叠
UPDATE `item` SET `stackable` = 0 WHERE `type` = '宝物';
