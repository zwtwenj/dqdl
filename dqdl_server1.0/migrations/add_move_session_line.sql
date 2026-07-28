-- ========== move_session 表新增 line 字段 ==========
-- 存移动路径 JSON:[{id,name,gx,gy}]，大地图据此画变色路径线。
-- 单步移动 = [起点, 终点]；后续寻路支持多段时存完整途经序列。
-- 详见 move-session.entity.ts 注释。

ALTER TABLE `move_session` ADD COLUMN `line` TEXT DEFAULT NULL
  COMMENT '移动路径 JSON:[{id,name,gx,gy}]（大地图画变色线用）'
  AFTER `to_name`;
