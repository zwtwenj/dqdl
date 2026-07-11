/**
 * 一次性脚本：直接在数据库给玩家设置习得「弄焰诀」。
 *
 * 玩家功法持有态存于 player.technique(JSON 数组)，元素结构沿用老版本：
 *   { id, level, cultivation, equipped }
 *   - id: technique 表主键（弄焰诀 gf-h1-1）
 *   - level: 当前修炼等级（初始 1）
 *   - cultivation: 当前功法修为进度（初始 0）
 *   - equipped: 是否装配（初始 true）
 *   max_cultivation 属于功法定义(base)，不存入玩家状态。
 *
 * 用法：
 *   npx ts-node scripts/set-player-technique.ts            # 默认操作所有 player
 *   npx ts-node scripts/set-player-technique.ts <playerId> # 仅指定玩家
 *   DRY=1 npx ts-node scripts/set-player-technique.ts      # 只读预览，不写库
 *
 * 幂等：若玩家已习得该功法则跳过（不覆盖等级/进度）。
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';

config({ path: resolve(__dirname, '..', '.env') });

const TECHNIQUE_ITEM_ID = 'gf-h1-1'; // 弄焰诀
const DRY = !!process.env.DRY;

const ds = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [],
  synchronize: false,
});

async function main() {
  await ds.initialize();
  const q = ds.createQueryRunner();

  // 1. 查弄焰诀的主键 id
  const techRows: any[] = await q.query(
    `SELECT id, item_id, name, \`rank\` FROM technique WHERE item_id = ?`,
    [TECHNIQUE_ITEM_ID],
  );
  if (techRows.length === 0) {
    throw new Error(
      `technique 表中未找到 item_id=${TECHNIQUE_ITEM_ID}（弄焰诀）。请先执行 migrations/add_technique.sql。`,
    );
  }
  const tech = techRows[0];
  console.log(`[功法] id=${tech.id}  item_id=${tech.item_id}  name=${tech.name}  rank=${tech.rank}`);

  // 2. 选定玩家
  const argId = process.argv[2];
  const players: any[] = argId
    ? await q.query(`SELECT id, character_id, name, technique FROM player WHERE id = ?`, [argId])
    : await q.query(`SELECT id, character_id, name, technique FROM player`);

  if (players.length === 0) {
    console.log('没有玩家数据，无可操作行。');
    await ds.destroy();
    return;
  }

  const newEntry = { id: tech.id, level: 1, cultivation: 0, equipped: true };

  for (const p of players) {
    let arr: any[] = [];
    try {
      const parsed = JSON.parse(p.technique || '[]');
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = [];
    }

    const exists = arr.some((e) => Number(e?.id) === tech.id);
    const before = JSON.stringify(arr);
    if (exists) {
      console.log(`[跳过] player#${p.id} (${p.name}) 已习得弄焰诀 → ${before}`);
      continue;
    }

    // 若当前没有装配任何功法，新加的默认 equipped=true；否则追加为未装备
    const hasEquipped = arr.some((e) => e?.equipped);
    const entry = hasEquipped ? { ...newEntry, equipped: false } : newEntry;
    arr.push(entry);
    const after = JSON.stringify(arr);

    console.log(`[更新] player#${p.id} (${p.name})`);
    console.log(`   before: ${before}`);
    console.log(`   after : ${after}`);

    if (!DRY) {
      await q.query(`UPDATE player SET technique = ? WHERE id = ?`, [after, p.id]);
      console.log(`   ✓ 已写入`);
    }
  }

  await ds.destroy();
  console.log(DRY ? '\n[DRY 模式] 未实际写库。去掉 DRY=1 执行写库。' : '\n完成。');
}

main().catch(async (e) => {
  console.error('出错:', e);
  try { await ds.destroy(); } catch {}
  process.exit(1);
});
