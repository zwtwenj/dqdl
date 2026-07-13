import { Injectable, BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';

/**
 * 数据库只读浏览服务（自动发现全部表+字段，只读数据）。
 *
 * 安全要点：
 *   - 所有表名参数先校验必须在 information_schema 中存在（防 SQL 注入）
 *   - 表名用反引号包裹；LIMIT/OFFSET 用参数化占位符
 *   - 只 SELECT，绝不拼任何写操作
 *
 * 注意：information_schema 查询用显式库名（从 DB_DATABASE 读取）参数化，
 * 不依赖 DATABASE() —— 连接池里不同连接的默认库可能不一致，DATABASE() 不可靠。
 */
@Injectable()
export class DbViewerService {
  /** 当前库名（所有 information_schema 查询用这个参数化，不靠 DATABASE()） */
  private readonly dbName: string;

  constructor(
    private readonly dataSource: DataSource,
    config: ConfigService,
  ) {
    this.dbName = config.get<string>('DB_DATABASE') || 'dqdl1.0';
  }

  /** 校验表名存在且属于当前库（防注入）。不存在抛 400。 */
  private async assertTableExists(table: string): Promise<void> {
    if (!/^[a-zA-Z0-9_]+$/.test(table)) {
      throw new BadRequestException('非法表名');
    }
    const res = await this.dataSource.query(
      `SELECT TABLE_NAME FROM information_schema.tables
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?`,
      [this.dbName, table],
    );
    if (toRows(res).length === 0) {
      throw new BadRequestException(`表 ${table} 不存在`);
    }
  }

  /** 列出当前库所有表 + 注释 + 行数估算 */
  async listTables(): Promise<{
    name: string;
    comment: string;
    rows: number;
    engine: string;
  }[]> {
    const res = await this.dataSource.query(
      `SELECT TABLE_NAME AS \`name\`, TABLE_COMMENT AS \`comment\`,
              TABLE_ROWS AS \`rows\`, ENGINE AS \`engine\`
       FROM information_schema.tables
       WHERE TABLE_SCHEMA = ?
       ORDER BY \`name\` ASC`,
      [this.dbName],
    );
    return toRows(res);
  }

  /** 列出某表所有字段：名称/类型/可空/默认/注释/主键 */
  async listColumns(table: string): Promise<{
    name: string;
    type: string;
    nullable: string;
    key: string;
    default: string | null;
    comment: string;
  }[]> {
    await this.assertTableExists(table);
    const res = await this.dataSource.query(
      `SELECT COLUMN_NAME AS \`name\`, COLUMN_TYPE AS \`type\`,
              IS_NULLABLE AS \`nullable\`, COLUMN_KEY AS \`key\`,
              COLUMN_DEFAULT AS \`default\`, COLUMN_COMMENT AS \`comment\`
       FROM information_schema.columns
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
       ORDER BY ORDINAL_POSITION ASC`,
      [this.dbName, table],
    );
    return toRows(res);
  }

  /** 分页查表数据（只读 SELECT，表名反引号包裹，LIMIT/OFFSET 参数化） */
  async listData(table: string, page = 1, size = 50): Promise<{ total: number; rows: any[] }> {
    await this.assertTableExists(table);
    const countRes = await this.dataSource.query(
      `SELECT COUNT(*) AS total FROM \`${table}\``,
    );
    const total = Number(toRows(countRes)[0]?.total) || 0;
    const listRes = await this.dataSource.query(
      `SELECT * FROM \`${table}\` LIMIT ? OFFSET ?`,
      [size, (page - 1) * size],
    );
    return { total, rows: toRows(listRes) };
  }
}

/**
 * 统一抽取 dataSource.query 结果为数组（与 agent-log 的 toRows 同源）。
 * TypeORM query 返回结构不稳定，此处兜底处理。
 */
function toRows(res: any): any[] {
  if (Array.isArray(res) && res.length === 2 && Array.isArray(res[0]) && res[1] && typeof res[1] === 'object' && !Array.isArray(res[1])) {
    return res[0];
  }
  if (Array.isArray(res)) return res;
  if (res && typeof res === 'object') return [res];
  return [];
}
