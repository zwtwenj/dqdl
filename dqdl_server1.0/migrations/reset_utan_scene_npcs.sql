-- ========== 重置乌坦城场景的静态 NPC ==========
-- 删除乌坦城所有场景下的静态 NPC，让下次进入场景时 ensureSceneNpcs 重新生成。
-- 动态 NPC（dynamic_npc 表）不受影响。
--
-- 原因：之前进入坊市时可能 agent 调用失败导致 NPC 没生成，ensureSceneNpcs 的幂等逻辑
--       会跳过"看起来已处理"的场景，需要清理后才能重试。

-- 先查乌坦城 id（确认存在）
SET @utan_id = (SELECT `id` FROM `location_net` WHERE `gx` = 0 AND `gy` = 0 LIMIT 1);

-- 删除乌坦城所有场景下的静态 NPC（npc 表 location_scene_id 指向乌坦城场景的）
DELETE FROM `npc`
WHERE `location_scene_id` IN (
  SELECT `id` FROM `location_scene` WHERE `net_id` = @utan_id
);

-- 验证：查看清理后的场景 + NPC 数（应该为 0）
SELECT s.`name`, s.`scene_type`,
  (SELECT COUNT(*) FROM `npc` WHERE `location_scene_id` = s.id) AS npc_count
FROM `location_scene` s
WHERE s.`net_id` = @utan_id;

-- 提示：执行后，进入佣兵公会/坊市/炼药师公会时，ensureSceneNpcs 会重新生成对应 NPC。
