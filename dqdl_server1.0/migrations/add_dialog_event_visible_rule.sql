-- ========== dialog_event：加可见性规则字段 ==========
-- 背景：某些对话快捷按钮需要按玩家状态条件显示（如「交付任务」仅在玩家有可交付任务时出现）。
--   dialog_event 挂 npc_role 是静态数据，无法表达「按玩家过滤」。
-- 改造：加 visible_rule 列存规则函数名，NpcService.findOne 返回前查规则库过滤。
--   空串 = 始终显示；非空 = dialog-visible-rules 中对应函数名，返回 false 则不返回。

ALTER TABLE `dialog_event`
  ADD COLUMN `visible_rule` VARCHAR(64) NOT NULL DEFAULT ''
  COMMENT '可见性规则函数名（空=始终显示；非空=dialog-visible-rules 中的函数名）'
  AFTER `event`;

-- 「交付任务」按钮（公会接待员的 completeTask 事件）：仅在玩家有可交付任务时显示
UPDATE `dialog_event`
  SET `visible_rule` = 'hasClaimableTask'
  WHERE `event` = 'completeTask';
