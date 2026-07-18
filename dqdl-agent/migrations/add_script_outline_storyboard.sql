-- ========== script_outline 加分镜字段（nodes + actor_map） ==========
-- 背景：剧本细化的第2步——把 story 的纯叙事节点（每节点一段 text）
--   细化为「带角色对白」的分镜剧本（每节点多行 lines，每行标注谁说的）。
--   细化结果存回 script_outline（同一故事一行），不另建表。
--
-- 新增字段：
--   location_map：地点 id → 信息映射。'{story_id}_loc{N}'
--     例：{"story_78980_loc1":{name:"山脉"}, "story_78980_loc2":{name:"沼泽"}}
--   actor_map：演员 id → 信息映射。玩家='player'；配角='{story_id}_actor{N}'
--     例：{"player":{...}, "story_78980_actor1":{gender,role,nature,description}}
--   nodes：分镜节点图 {start, map:{nodeId:{location, lines:[{role,text}], choices?, end?}}}
--     - location：该节点发生的地点 id（→ location_map 的 key）
--     - lines：角色对白数组，role 取自 actor_map 的 key 或 'narration'（旁白）
--     - choices/end：沿用 story 原结构（goto 跳转、end 结局）
--   status：细化状态 pending(仅大纲) / done(已细化)
-- 幂等：ALTER 无 IF NOT EXISTS，重复执行报 Duplicate column 忽略。

ALTER TABLE `script_outline`
  ADD COLUMN `location_map` JSON NULL
    COMMENT '地点id→信息映射 {story_xxx_loc1:{name:"山脉"}}；未细化时为NULL'
    AFTER `locations`,
  ADD COLUMN `actor_map` JSON NULL
    COMMENT '演员id→信息映射 {player:{...}, story_xxx_actor1:{...}}；未细化时为NULL'
    AFTER `actors`,
  ADD COLUMN `nodes` JSON NULL
    COMMENT '分镜节点图 {start, map:{id:{location,lines:[{role,text}],choices?,end?}}}；未细化时为NULL'
    AFTER `actor_map`,
  ADD COLUMN `status` VARCHAR(16) NOT NULL DEFAULT 'pending'
    COMMENT 'pending=仅大纲(actors是描述列表); done=已细化(有location_map+actor_map+nodes)'
    AFTER `nodes`;
