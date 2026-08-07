import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StoryEvent } from './story-event.entity';
import { StoryEventInstance } from './story-event-instance.entity';
import { StoryService } from './story.service';
import { StoryController } from './story.controller';
import { PlayerModule } from '../player/player.module';

/**
 * 故事事件模块：story_event（事件定义）+ story_event_instance（运行实例）。
 *
 * StoryEvent 表由 dqdl-agent 的 adapt_story.py 写库（结构转换 + action 挂载 + 入库）。
 * StoryService 提供运行时查询：玩家进入游戏时查当前进行中的事件及当前节点。
 * 约定：同一时间一个玩家只能触发一个事件。
 *
 * 后续扩展：节点推进（advance）、action 原子化事件推送（SSE story_event）在本模块实现。
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([StoryEvent, StoryEventInstance]),
    PlayerModule,
  ],
  providers: [StoryService],
  controllers: [StoryController],
  exports: [StoryService],
})
export class StoryModule {}
