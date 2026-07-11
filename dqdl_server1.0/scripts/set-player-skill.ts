/**
 * 一次性脚本：给玩家设置默认习得的斗技（取 skill 表前若干条），便于斗技弹窗测试。
 *
 * 玩家斗技持有态存于 player.skill(JSON 数组)，元素结构沿用老版本：
 *   { id, level, cultivation, carry }
 *   - id: skill 表主键
 *   - level: 当前修炼等级（初始 1）
 *   - cultivation: 当前斗技修为进度（初始 0）
 *   - carry: 装备槽位 1~5（前 5 条默认装备到 1~5；多余的留空，可在弹窗中手动装备）
 *   max_cultivation 属于公式 K(阶)*2^(level-1)，不存入玩家状态。
 *
 * 用法：
 *   npx ts-node scripts/set-player-skill.ts            # 默认操作所有 player
 *   npx ts-node scripts/set-player-skill.ts <playerId> # 仅指定玩家
 *   DRY=1 npx ts-node scripts/set-player-skill.ts      # 只读预览，不写库
 *
 * 幂等：若玩家 skill 列表已非空则跳过（不覆盖已有装配）。
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';

config({ path: resolve(__dirname, '..', '.env') });

/** 默认习得前 N 条斗技（覆盖装备栏 5 槽 + 备选） */
const DEFAULT_SKILL_COUNT = 8;
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

  // 1. 取默认斗技定义（按 id 升序）
  const skills: any[] = await q.query(
    `SELECT id, item_id, name, \`rank\` FROM skill ORDER BY id ASC LIMIT ?`,
    [DEFAULT_SKILL_COUNT],
  );
  if (skills.length === 0) {
    throw new Error('skill 表为空，请先执行 migrations/add_skill.sql。');
  }
  console.log(`[斗技] 取到 ${skills.length} 条默认斗技：`);
  skills.forEach((s) => console.log(`   id=${s.id}  ${s.item_id}  ${s.name}  rank=${s.rank}`));

  // 2. 选定玩家
  const argId = process.argv[2];
  const players: any[] = argId
    ? await q.query(`SELECT id, character_id, name, skill FROM player WHERE id = ?`, [argId])
    : await q.query(`SELECT id, character_id, name, skill FROM player`);

  if (players.length === 0) {
    console.log('没有玩家数据，无可操作行。');
    await ds.destroy();
    return;
  }

  // 前 5 条默认装备到槽 1~5，其余习得但不装备
  const newEntries = skills.map((s, i) => ({
    id: s.id,
    level: 1,
    cultivation: 0,
    ...(i < 5 ? { carry: i + 1 } : {}),
  }));
  const newJson = JSON.stringify(newEntries);

  for (const p of players) {
    let arr: any[] = [];
    try {
      const parsed = JSON.parse(p.skill || '[]');
      if (Array.isArray(parsed)) arr = parsed;
    } catch {
      arr = [];
    }

    const before = JSON.stringify(arr);
    if (arr.length > 0) {
      console.log(`[跳过] player#${p.id} (${p.name}) 已有 ${arr.length} 个斗技 → ${before}`);
      continue;
    }

    console.log(`[更新] player#${p.id} (${p.name})`);
    console.log(`   before: ${before}`);
    console.log(`   after : ${newJson}`);

    if (!DRY) {
      await q.query(`UPDATE player SET skill = ? WHERE id = ?`, [newJson, p.id]);
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
