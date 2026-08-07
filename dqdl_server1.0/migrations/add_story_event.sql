-- ========== 故事事件（story_event + story_event_instance） ==========
-- 用途：把 dqdl_writer 生成的网状故事（narrative/choice/ending）适配成可玩事件。
--
-- 设计原则（与项目其他表一致）：
--   1. 一个事件 = 一条 story_event 记录（整个网状故事入库，不做连接表拆分）
--   2. 节点 + 连线都在 nodes JSON 里（next/choices 原样保留）
--   3. 节点间的游戏动作作为 JSON 里的 action 字段挂在节点/分支上
--      （battle=战斗 / move=移动任务 / reward=奖励 / dialog=对话(预留) / null=直接推进）
--   4. story_event_instance 一条 = 玩家一次触发（current_node/node_path 演出进度）
--
-- 写入方：dqdl_writer 适配阶段（agent 从向量库检索 mob/地图/奖励 → 挂 action）。
-- 读取方：dqdl_server1.0 story 模块（运行时按 current_node 读 action → 封装原子化事件 → SSE 推前端）。
-- 与现有表关系：script_outline（剧本大纲）存分镜/演员映射；story_event 存纯可玩事件数据。

CREATE TABLE IF NOT EXISTS `story_event` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `story_id` VARCHAR(64) NOT NULL COMMENT '故事唯一标识(story_xxx)',
  `title` VARCHAR(64) NOT NULL COMMENT '事件标题',
  `theme` VARCHAR(32) DEFAULT NULL COMMENT '主题(奇遇/冲突/抉择/探索等)',
  `nodes` JSON NOT NULL COMMENT '完整节点图 {start, nodes:{nodeId:{type,title,text,next/choices,action}}}',
  `endings_count` INT NOT NULL DEFAULT 0 COMMENT '结局数(冗余,扫描 end=true 节点数)',
  `max_depth` INT NOT NULL DEFAULT 0 COMMENT '最长链路深度(从start到最深end的步数)',
  `source` VARCHAR(16) NOT NULL DEFAULT 'agent' COMMENT 'agent=Agent生成; manual=人工',
  `status` VARCHAR(16) NOT NULL DEFAULT 'active' COMMENT 'active=可用 disabled=下架',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_story_event_story_id` (`story_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='故事事件定义(整个网状故事一条记录,节点+连线+动作都在nodes JSON)';

CREATE TABLE IF NOT EXISTS `story_event_instance` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `event_id` INT NOT NULL COMMENT '关联 story_event.id',
  `player_id` INT NOT NULL COMMENT '玩家ID → player.id',
  `current_node` VARCHAR(32) DEFAULT NULL COMMENT '当前演出节点(start起)',
  `node_path` JSON DEFAULT NULL COMMENT '走过的节点数组(演出链路)',
  `status` VARCHAR(16) NOT NULL DEFAULT 'pending' COMMENT 'pending=待触发 playing=演出中 done=已结束 abandoned=已放弃',
  `from_status` INT DEFAULT NULL COMMENT '触发前玩家状态(演出结束恢复用)',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  `updated_at` DATETIME(6) DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  KEY `idx_story_event_inst_player` (`player_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='故事事件运行实例(一条=玩家一次触发,记录演出进度)';
