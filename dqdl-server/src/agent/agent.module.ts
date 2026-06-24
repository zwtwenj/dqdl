import { Global, Module } from '@nestjs/common';
import { AgentClient } from './agent.client';

/**
 * AgentClient 全局模块：导入一次后，任意模块的 Provider 均可直接注入 AgentClient，
 * 无需在各业务模块重复声明。
 */
@Global()
@Module({
  providers: [AgentClient],
  exports: [AgentClient],
})
export class AgentModule {}
