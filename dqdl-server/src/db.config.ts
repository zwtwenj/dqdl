import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSourceOptions } from 'typeorm';

// 以本文件位置定位 .env（src/ 或 dist/ 下一级即项目根），独立脚本(seed)复用
config({ path: resolve(__dirname, '..', '.env') });

/** 从 .env 读取 DB 配置，供 seed 等独立脚本复用 */
export function dbOptions(entities: any[]): DataSourceOptions {
  return {
    type: 'mysql',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    entities,
    synchronize: true,
  };
}
