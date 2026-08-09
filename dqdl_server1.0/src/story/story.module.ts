import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoryEvent } from './story-event.entity';
import { StoryEventInstance } from './story-event-instance.entity';
import { StoryService } from './story.service';
import { StoryTriggerService } from './story-trigger.service';
import { StoryController } from './story.controller';
import { PlayerModule } from '../player/player.module';
import { ScriptModule } from '../script/script.module';
import { TaskModule } from '../task/task.module';

/**
 * 故事事件模块：story_event（事件定义）+ story_event_instance（运行实例）。
 *
 * StoryEvent 表由 dqdl-agent 的 adapt_story.py 写库（结构转换 + action 挂载 + 入库）。
 * StoryService 提供运行时查询与推进：玩家进入游戏时查当前进行中的事件及当前节点；
 * advance 推进时执行连线配置（publish_task → TaskService.issueStoryTask 发布任务）。
 * StoryTriggerService 提供触发入口：进入地图等游戏钩子 → 匹配 trigger_config → 建实例 + SSE。
 * 约定：同一时间一个玩家只能触发一个事件。
 *
 * 依赖：TaskModule（连线发布任务）；任务完成→故事推进走事件总线（TaskModule 不反向依赖本模块）。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([StoryEvent, StoryEventInstance]),
    PlayerModule,
    ScriptModule,
    TaskModule,
  ],
  providers: [StoryService, StoryTriggerService],
  controllers: [StoryController],
  exports: [StoryService, StoryTriggerService],
})
export class StoryModule {}
