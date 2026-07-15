-- ========== static_npc：区分地图节点绑定 vs 场景绑定 ==========
-- 背景：原 location_id 一列存了两种 id（location_net 节点 或 location_scene 场景），
--   语义混淆且 id 空间重叠（节点28 vs 场景28 会撞号）。
-- 改造：拆为两列，只有一个有值：
--   location_id          → 绑定地图节点（location_net.id），玩家在节点上能见到
--   location_scene_id    → 绑定场景（location_scene.id），玩家进场景能见到

ALTER TABLE `static_npc`
  ADD COLUMN `location_scene_id` INT NULL
  COMMENT '绑定的场景id（location_scene.id）；与 location_id 互斥，仅一个有值'
  AFTER `location_id`;

-- 先把 location_id 改可空（原 NOT NULL，否则下面 UPDATE 置 NULL 会报错）
ALTER TABLE `static_npc`
  MODIFY COLUMN `location_id` INT NULL
  COMMENT '绑定的地图节点id（location_net.id）；与 location_scene_id 互斥';

-- 数据迁移：把原绑场景的 NPC（location_id 实际是场景id）挪到 location_scene_id。
-- 判定：该 location_id 在 location_scene.id 中存在 → 是场景绑定 → 迁移
-- （MySQL 不允许在 UPDATE 子查询里直接引用待更新表，包一层临时表 t 绕过）
UPDATE `static_npc` sn
  SET sn.`location_scene_id` = sn.`location_id`,
      sn.`location_id` = NULL
  WHERE sn.`location_id` IN (SELECT `id` FROM (SELECT `id` FROM `location_scene`) t);

-- 互斥查询索引（便于按节点或按场景查 NPC）
ALTER TABLE `static_npc`
  ADD KEY `idx_npc_location` (`location_id`),
  ADD KEY `idx_npc_scene` (`location_scene_id`);
