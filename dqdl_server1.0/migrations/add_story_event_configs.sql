-- ========== story_event 表加配置字段（与配置页数据结构一致） ==========
-- 配置页（dqdl_admin_web EventDetail.vue）目前有两块可配置数据，分别落库：
--
--   1. trigger_config：事件触发配置（EventTriggers 组件输出）
--      {
--        "trigger": "enter_map|complete_task|defeat_enemy|use_item",  -- 触发条件类型
--        "params": {                                                  -- 条件参数（与页面 triggerParams 一致）
--          "player": { "level": { "symbol": ">|<|=", "value": 10 },
--                       "money": { "symbol": ">", "value": 1000 } },
--          "location_net": { "location_type": { "value": ["wild"] } }
--        },
--        "probability": 30                                            -- 触发概率 0-100
--      }
--
--   2. connect_configs：连线配置（点击连线的"连线事件"，目前支持发布任务）
--      {
--        "n1->n2": {                                                  -- key = "source->target"（节点 id 连线）
--          "event": "publish_task",
--          "task": {
--            "taskTitle": "前往青云城",
--            "description": "...",
--            "target": [ { "type": "go_to_location|go_to_location_defeat_mob",
--                          "value": { "location": { "distance": "", "loc_type": "wild", "mob_count": 3 } } } ]
--          }
--        }
--      }
--
-- 与项目其他 migration 一致：裸 ALTER，靠"执行一次"保证幂等，勿重复跑。

ALTER TABLE `story_event`
  ADD COLUMN `trigger_config` JSON DEFAULT NULL COMMENT '事件触发配置 {trigger, params, probability}（EventTriggers 输出）' AFTER `nodes`,
  ADD COLUMN `connect_configs` JSON DEFAULT NULL COMMENT '连线配置 {"src->tgt": {event, task}}（连线事件输出）' AFTER `trigger_config`;
