-- ========== 多结局故事库（story） ==========
-- 存 Agent 生成的纯叙事分支故事（不是场景事件，无任何游戏机制）。
-- 节点 = 一段剧情文本(text) + 玩家选择(choices) + 是否结束(end)。
-- 用途：故事素材存档。后续「剧本细化(分镜/演员)」「结构化处理」在第2、3步再做。
-- 结构对齐 SceneBranchDialog 的假数据格式 {start, nodes:{id:{text,choices,end}}}。
--
-- 写入方：dqdl-agent/db.py 的 save_story()（agent 直接写库）。
CREATE TABLE IF NOT EXISTS `story` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `story_id` VARCHAR(64) NOT NULL COMMENT '故事唯一标识(story_随机数)',
  `title` VARCHAR(64) NOT NULL COMMENT '故事标题',
  `summary` VARCHAR(255) DEFAULT NULL COMMENT '故事梗概一句话(便于检索)',
  `theme` VARCHAR(32) DEFAULT NULL COMMENT '主题(奇遇/冲突/抉择/探索/复仇等)',
  `nodes` JSON NOT NULL COMMENT '故事节点图 {start, map:{nodeId:{text,choices:[{text,goto}],end?}}}',
  `endings_count` INT NOT NULL DEFAULT 0 COMMENT '结局数(冗余,扫描 end=true 节点数)',
  `max_depth` INT NOT NULL DEFAULT 0 COMMENT '最长链路深度(冗余,从start到最深end的步数)',
  `source` VARCHAR(16) NOT NULL DEFAULT 'agent' COMMENT 'agent=Agent生成; manual=人工',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_story_id` (`story_id`),
  KEY `idx_story_theme` (`theme`),
  KEY `idx_story_endings` (`endings_count`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='多结局故事库(Agent生成的纯叙事分支故事存档)';
