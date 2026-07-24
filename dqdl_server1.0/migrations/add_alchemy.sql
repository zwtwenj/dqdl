-- ========== 炼丹系统：pill_recipe 表 + item 加炼丹字段 + player 加丹炉字段 + 种子数据 ==========
-- 移植自老版本 dqdl-server/src/alchemy。

-- ---- item 表加 3 个炼丹字段 ----
ALTER TABLE `item`
  ADD COLUMN `element_energy` TEXT DEFAULT NULL COMMENT '元素能量JSON {木:10,火:5}（草药/材料/魔核用）' AFTER `use_effect`,
  ADD COLUMN `alchemy_tier` INT NOT NULL DEFAULT 0 COMMENT '炼丹品阶(0=非炼丹物)' AFTER `element_energy`,
  ADD COLUMN `furnace_spec` TEXT DEFAULT NULL COMMENT '丹炉规格JSON {tier,slots,cap,max_durability}（type=丹炉用）' AFTER `alchemy_tier`;

-- ---- player 表加 3 个丹炉字段 ----
ALTER TABLE `player`
  ADD COLUMN `recipes` VARCHAR(2000) NOT NULL DEFAULT '[]' COMMENT '已习得丹方JSON [recipe_id,...]' AFTER `technique`,
  ADD COLUMN `equipped_furnace` VARCHAR(32) DEFAULT NULL COMMENT '当前装备丹炉item_id' AFTER `recipes`,
  ADD COLUMN `furnace_durability` INT NOT NULL DEFAULT 0 COMMENT '当前丹炉耐久' AFTER `equipped_furnace`;

-- ---- pill_recipe 表 ----
CREATE TABLE IF NOT EXISTS `pill_recipe` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `recipe_id` VARCHAR(32) NOT NULL COMMENT '全局丹方ID(pf-001等)',
  `output_item_id` VARCHAR(32) NOT NULL COMMENT '产出丹药item_id',
  `name` VARCHAR(128) NOT NULL COMMENT '丹方名称',
  `tier` INT NOT NULL DEFAULT 1 COMMENT '品阶1/2/3',
  `required` TEXT NOT NULL COMMENT '目标元素能量JSON {木:20,火:10}',
  `tolerance` TEXT NOT NULL COMMENT '每元素公差JSON {木:4,火:2}',
  `min_furnace_tier` INT NOT NULL DEFAULT 1 COMMENT '所需最低丹炉品阶',
  `base_yield` INT NOT NULL DEFAULT 1 COMMENT '基础产量',
  `price` INT NOT NULL DEFAULT 0 COMMENT '学习价格(金币)',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_recipe_id` (`recipe_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='丹方表';

-- ========== 种子数据 ==========

-- ---- 草药(item type='草药') ----
INSERT INTO `item` (`item_id`, `name`, `type`, `price`, `description`, `usable`, `element_energy`, `alchemy_tier`) VALUES
('yb-001', '赤血藤', '草药', 15, '止血生肌，加快伤口愈合', 0, '{"木":10,"火":5}', 1),
('yb-002', '清灵花', '草药', 15, '清心凝神，安抚神识', 0, '{"水":10,"土":5}', 1),
('yb-003', '回气草', '草药', 12, '温补斗气，恢复体力', 0, '{"土":10}', 1),
('yb-004', '烈阳叶', '草药', 12, '淬炼筋骨，短暂增力', 0, '{"金":10}', 1),
('yb-005', '寒潭藻', '草药', 14, '清热解毒', 0, '{"木":6,"水":6}', 1),
('yb-006', '火心草', '草药', 18, '激发血脉，冲击瓶颈', 0, '{"火":8,"雷":2}', 1),
('yb-007', '风铃草', '草药', 14, '提神醒脑，提升反应', 0, '{"风":10}', 1),
('yb-008', '铁骨藤', '草药', 14, '强健筋骨，增加体魄', 0, '{"金":6,"土":4}', 1),
('yb-009', '紫叶兰', '草药', 35, '生肌续脉', 0, '{"木":12,"火":3}', 1),
('yb-010', '凝冰花', '草药', 35, '清热拔毒', 0, '{"水":12}', 1),
('yb-011', '凝神藤', '草药', 120, '大幅凝神', 0, '{"水":50}', 2),
('yb-012', '紫心髓', '草药', 200, '引雷淬体', 0, '{"雷":35,"金":15}', 2),
('yb-013', '赤焰果', '草药', 110, '淬体增力', 0, '{"火":40,"土":10}', 2),
('yb-014', '金刚叶', '草药', 110, '强化筋骨', 0, '{"金":45}', 2),
('yb-015', '翠灵根', '草药', 100, '大补斗气', 0, '{"土":40,"木":10}', 2),
('yb-016', '风旋草', '草药', 190, '提速凝神', 0, '{"风":45}', 2),
('yb-017', '天雷果', '草药', 600, '破障冲关', 0, '{"雷":100}', 3),
('yb-018', '九幽莲', '草药', 650, '解百毒续断脉', 0, '{"木":70,"水":50}', 3),
('yb-019', '地心炎晶', '草药', 680, '强力淬体', 0, '{"火":80,"金":40}', 3),
('yb-020', '万年土精', '草药', 620, '固本培元', 0, '{"土":120}', 3)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- ---- 丹炉(item type='丹炉') ----
INSERT INTO `item` (`item_id`, `name`, `type`, `price`, `description`, `usable`, `alchemy_tier`, `furnace_spec`) VALUES
('dl-1', '黄阶丹炉', '丹炉', 0, '最常见的丹炉，最多投放4种材料，单元素能量上限100。', 0, 1, '{"tier":1,"slots":4,"cap":100,"max_durability":50}'),
('dl-2', '玄阶丹炉', '丹炉', 800, '可炼二阶丹药，最多投放6种材料，单元素能量上限300。', 0, 2, '{"tier":2,"slots":6,"cap":300,"max_durability":80}'),
('dl-3', '地阶丹炉', '丹炉', 3000, '可炼三阶丹药，最多投放8种材料，单元素能量上限800。', 0, 3, '{"tier":3,"slots":8,"cap":800,"max_durability":120}'),
('dl-4', '天阶丹炉', '丹炉', 12000, '传闻中的天阶丹炉，可炼顶级丹药。', 0, 4, '{"tier":4,"slots":10,"cap":2000,"max_durability":200}')
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);

-- ---- 丹药(item type='丹药') ----
-- 注意：部分丹药item_id可能已存在(init.sql种子)，用ON DUPLICATE KEY只更新use_effect
INSERT INTO `item` (`item_id`, `name`, `type`, `price`, `description`, `usable`, `use_effect`) VALUES
('dp-001', '回春丹', '丹药', 20, '服用后恢复30点生命。', 1, '{"type":"instant","fn":"heal_hp","params":{"amount":30}}'),
('dp-002', '回气丹', '丹药', 18, '服用后恢复20点斗气。', 1, '{"type":"instant","fn":"heal_energy","params":{"amount":20}}'),
('dp-003', '清心丹', '丹药', 25, '服用后下次战斗中智力+3。', 1, '{"type":"buff","buff":"qingxin_t1","scope":"next_battle"}'),
('dp-004', '增力丹', '丹药', 25, '服用后下次战斗中力量+3。', 1, '{"type":"buff","buff":"zengli_t1","scope":"next_battle"}'),
('dp-005', '解毒丹', '丹药', 22, '服用后恢复15点生命，化解低阶毒素。', 1, '{"type":"instant","fn":"heal_hp","params":{"amount":15}}'),
('dp-006', '凝元丹', '丹药', 150, '服用后立即获得50点修为。', 1, '{"type":"instant","fn":"gain_cultivation","params":{"amount":50}}'),
('dp-007', '雷火丹', '丹药', 180, '服用后下次战斗中力量+15%。', 1, '{"type":"buff","buff":"leihuo_t2","scope":"next_battle"}'),
('dp-008', '破障丹', '丹药', 600, '服用后下次突破成功率+15%。', 1, '{"type":"instant","fn":"add_breakthrough_bonus","params":{"amount":15}}'),
('dp-009', '九幽解毒丹', '丹药', 650, '服用后恢复150点生命，可解百毒。', 1, '{"type":"instant","fn":"heal_hp","params":{"amount":150}}')
ON DUPLICATE KEY UPDATE `use_effect`=VALUES(`use_effect`);

-- ---- 丹方(pill_recipe 表) ----
INSERT INTO `pill_recipe` (`recipe_id`, `output_item_id`, `name`, `tier`, `required`, `tolerance`, `min_furnace_tier`, `base_yield`, `price`) VALUES
('pf-001', 'dp-001', '回春丹丹方', 1, '{"木":20,"火":10}', '{"木":4,"火":2}', 1, 1, 50),
('pf-002', 'dp-002', '回气丹丹方', 1, '{"土":20}', '{"土":4}', 1, 1, 50),
('pf-003', 'dp-003', '清心丹丹方', 1, '{"水":20,"土":10}', '{"水":4,"土":2}', 1, 1, 60),
('pf-004', 'dp-004', '增力丹丹方', 1, '{"金":20}', '{"金":4}', 1, 1, 60),
('pf-005', 'dp-005', '解毒丹丹方', 1, '{"木":12,"水":12}', '{"木":3,"水":3}', 1, 1, 55),
('pf-006', 'dp-006', '凝元丹丹方', 2, '{"水":50}', '{"水":10}', 2, 1, 250),
('pf-007', 'dp-007', '雷火丹丹方', 2, '{"雷":35,"金":15}', '{"雷":7,"金":3}', 2, 1, 280),
('pf-008', 'dp-008', '破障丹丹方', 3, '{"雷":100}', '{"雷":20}', 3, 1, 900),
('pf-009', 'dp-009', '九幽解毒丹丹方', 3, '{"木":140,"水":100}', '{"木":28,"水":20}', 3, 1, 950)
ON DUPLICATE KEY UPDATE `name`=VALUES(`name`);
