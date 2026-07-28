-- ========== move_session 表新增 current_net_id 字段 ==========
-- 多段移动实时追踪玩家当前已到达的节点 id。
-- startMove 时 = line[0]（起点）；arrive 走下一段时推进；cancel 时玩家停在此节点。
-- 详见 move-session.entity.ts 注释。

ALTER TABLE `move_session` ADD COLUMN `current_net_id` INT NOT NULL DEFAULT 0
  COMMENT '当前已到达节点 id（多段移动进度）'
  AFTER `to_net_id`;

ALTER TABLE `move_session` ADD COLUMN `current_seg` INT NOT NULL DEFAULT 0
  COMMENT '当前段索引（0起）'
  AFTER `current_net_id`;

-- 注：status 字段值语义变更（arrived/cancelled → 统一 finished），
-- 历史数据无需迁移（代码兼容读取），新数据用 active/finished。
