-- ========== 佣兵任务模块建表（幂等） ==========
-- 依赖：player 表、location_net 表、mob 表
-- 表：task（佣兵/通用任务实例）
-- 参照老版本 dqdl-server/src/task/task.entity.ts，适配新网状地图（target 用 net_id 而非老 location 树）

CREATE TABLE IF NOT EXISTS `task` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `player_id` INT NOT NULL COMMENT '所属玩家ID → player.id',
  `name` VARCHAR(64) NOT NULL DEFAULT '任务' COMMENT '任务名（简短标题）',
  `description` VARCHAR(255) NOT NULL COMMENT '任务描述（人话文案）',
  `target` TEXT NOT NULL COMMENT '目标JSON：[{desc,current,required,net_id,net_name,mob_id,mob_name}]',
  `reward` TEXT NOT NULL COMMENT '奖励JSON：[{type:"money",value:8000}] 或 [{name,count}]',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending=进行中 claimed=已领奖',
  `type` VARCHAR(32) NOT NULL DEFAULT 'common' COMMENT 'common=普通 adventurer=佣兵公会战斗任务',
  `star` INT NOT NULL DEFAULT 1 COMMENT '星级/危险度（1/2/3）',
  `delivery` TEXT NULL COMMENT '交付信息JSON：{npc_id,npc_name,scene_id,scene_name}',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_task_player_status` (`player_id`, `status`),
  KEY `idx_task_type` (`type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='佣兵/通用任务实例表';
