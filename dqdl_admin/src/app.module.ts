import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { AgentLogModule } from './agent-log/agent-log.module';
import { DbViewerModule } from './db-viewer/db-viewer.module';
import { EventManagementModule } from './event-management/event-management.module';

/**
 * 管理平台后端根模块。
 *
 * TypeORM 连接同一个 dqdl1.0 库（与游戏后端共享数据源）：
 *   - entities 只注册 AdminUser（管理平台自己的表，synchronize:true 自动建表）
 *   - 其余业务表通过 DataSource 原生查询（information_schema + 分页 SELECT），只读
 *   - 绝不 synchronize 业务表（entities 不含它们，避免误改结构）
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'mysql',
        host: config.get('DB_HOST'),
        port: +config.get('DB_PORT', '3306'),
        username: config.get('DB_USER'),
        password: config.get('DB_PASSWORD'),
        database: config.get('DB_DATABASE'),
        autoLoadEntities: true,
        // admin_users 表用手动 SQL 建（migrations/admin_users.sql），
        // 关闭 synchronize 避免重复启动时 "Table already exists" 报错。
        synchronize: false,
        charset: 'utf8mb4',
      }),
    }),
    AuthModule,
    AgentLogModule,
    DbViewerModule,
    EventManagementModule,
  ],
})
export class AppModule {}
