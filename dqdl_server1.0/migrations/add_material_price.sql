-- ========== 材料定价回填（幂等） ==========
-- 背景：导入材料时材料表无价格源，item.price 全部为 0，导致背包无法显示出售价。
-- 经济系统唯一权威是 item 表（材料表即使有价格也只作参考）。
-- 规则：材料统一默认价 50 金（出售价 = price/2 = 25 金），后续可按 rarity 细化。
-- 导入脚本 import-material-core.ts 已同步修正（price: 50）。

UPDATE `item`
SET `price` = 50
WHERE `type` = '材料' AND `price` = 0;
