-- ========== script_instance 加选角映射 + 锁定前状态字段 ==========
-- 背景：剧本触发后玩家进入「剧本演出」特殊状态(锁定移动)，Agent 给配角选角。
--   - actor_mapping：选角映射 {actor_key:{type,id}}
--     · 配角：{story_xxx_actor1:{type:'dynamic_npc', id:28}}
--     · 玩家：{player:{type:'player', id:1}}
--     · 地点：{story_xxx_loc1:{type:'location_scene', id:29}}（本轮全填玩家当前位置）
--   - from_status：锁定前玩家原状态(演出结束恢复用)
-- 幂等：重复执行报 Duplicate column，忽略。

ALTER TABLE `script_instance`
  ADD COLUMN `actor_mapping` JSON NULL
    COMMENT '选角映射 {actor_key:{type,id}}；配角=dynamic_npc, 玩家=player, 地点=location_scene/location_net'
    AFTER `node_path`,
  ADD COLUMN `from_status` INT NULL
    COMMENT '锁定前玩家原状态(演出结束恢复用)'
    AFTER `actor_mapping`;
