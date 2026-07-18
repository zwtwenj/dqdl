import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScriptOutline } from './script-outline.entity';
import { ScriptInstance } from './script-instance.entity';
import { ScriptTriggerService } from './script-trigger.service';
import { ScriptSseService } from './script-sse.service';
import { ScriptController } from './script.controller';
import { PlayerModule } from '../player/player.module';

/**
 * 剧本模块：剧本触发引擎（@OnEvent 监听游戏钩子）+ SSE 推送 + 实例日志。
 *
 * ScriptOutline 表由 dqdl-agent 写库（generate_outline/storyboard），本模块只读。
 * ScriptTriggerService 通过事件总线接收 5 个游戏钩子，命中后：
 *   - 防重复检查（同玩家+同剧本进行中不重复触发）
 *   - 写 ScriptInstance（pending + current_node=start）
 *   - 经 ScriptSseService 推前端
 *
 * ScriptTriggerService / ScriptSseService 对外 export，供其他模块注入。
 */
@Module({
  imports: [TypeOrmModule.forFeature([ScriptOutline, ScriptInstance]), PlayerModule],
  providers: [ScriptTriggerService, ScriptSseService],
  controllers: [ScriptController],
  exports: [ScriptTriggerService, ScriptSseService],
})
export class ScriptModule {}
