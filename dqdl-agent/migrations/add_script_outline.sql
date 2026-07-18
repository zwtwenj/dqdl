-- ========== 剧本大纲表（script_outline） ==========
-- Agent 从 story（多结局故事）提取的「舞台 + 演员」主题内容。
-- 这是「剧本细化」的第一步：从纯叙事故事提取演出要素，尚未涉及分镜。
--   - locations：地点类型数组（自由描述词：山脉/沼泽/遗迹/坊市…，忽略具体地名）
--   - actors：演员数组（玩家 is_player=true + 配角，含性别/职业/性格/描述，忽略名字）
-- 与 story 一对一（story_id UNIQUE）：一个故事只生成一份剧本大纲。
-- 写入方：dqdl-agent/db.py 的 save_script_outline()（agent 直接写库）。
CREATE TABLE IF NOT EXISTS `script_outline` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `story_id` VARCHAR(64) NOT NULL COMMENT '→ story.story_id（一个故事一行剧本大纲）',
  `title` VARCHAR(64) NOT NULL COMMENT '剧本标题（冗余自 story，便于查阅）',
  `locations` JSON NOT NULL COMMENT '地点类型数组 [{name:"山脉"},...] 自由描述词，忽略具体地名',
  `actors` JSON NOT NULL COMMENT '演员数组 [{is_player,gender,role,nature,description}]，忽略名字',
  `source` VARCHAR(16) NOT NULL DEFAULT 'agent' COMMENT 'agent=Agent提取; manual=人工',
  `created_at` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_outline_story_id` (`story_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='剧本大纲（Agent从故事提取的舞台+演员）';
