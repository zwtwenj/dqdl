/**
 * 一次性导入脚本：魔兽图鉴 → mob 表，草药图鉴 → alchemy + item 表。
 *
 * 数据源：
 *   - D:\text\icarus-models\dqdl\scripts\mob_inserts.sql   (303 条魔兽)
 *   - D:\text\icarus-models\dqdl\scripts\alchemy_data.json (20 株草药)
 *
 * 运行：npx ts-node scripts/import-mob-alchemy.ts
 *
 * 幂等：先按 mob_id / item_id 查重，已存在则跳过（不覆盖）。
 * item 表的草药行：ref_type='alchemy', ref_id 指向对应 alchemy.id。
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import { readFileSync } from 'fs';
import { Mob } from '../src/mob/mob.entity';
import { Alchemy } from '../src/alchemy/alchemy.entity';
import { Item } from '../src/item/item.entity';

config({ path: resolve(__dirname, '..', '.env') });

const ds = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [Mob, Alchemy, Item],
  synchronize: false,
});

/* ============ mob 解析 ============ */
interface ParsedMob {
  mob_id: string;
  name: string;
  attribute: string | null;
  power: number;
  intelligence: number;
  quick: number;
  stamina: number;
  description: string;
  drops: string;
}

/**
 * 解析 mob_inserts.sql：每条 INSERT 形如
 *   INSERT INTO mob (...) VALUES ('WB-001', '焰尾蜥', '魔兽', 6, 4, 7, 5, '火', '【外观】...\n...', '[{...}]');
 * 难点：description 和 drops 含换行、单引号（转义为 ''）、嵌套 JSON。
 * 用状态机逐字符扫描 VALUES (...) 的 9 个字段。
 */
function parseMobInserts(sql: string): ParsedMob[] {
  const results: ParsedMob[] = [];
  const lines = sql.split('\n');

  // 把一条 INSERT（可能跨多行）合并成一行，用 INSERT INTO ... '); 为分隔
  const statements: string[] = [];
  let current = '';
  for (const line of lines) {
    current += (current ? '\n' : '') + line;
    // 一条 INSERT 以 );\n 结束
    if (/;\s*$/.test(line) && current.includes('INSERT INTO')) {
      statements.push(current);
      current = '';
    }
  }
  if (current.trim()) statements.push(current);

  for (const stmt of statements) {
    // 提取 VALUES (...) 的内容
    const valMatch = stmt.match(/VALUES\s*\((.*)\)\s*;?\s*$/s);
    if (!valMatch) continue;
    const valBody = valMatch[1];
    // 用状态机分割字段（逗号分隔，但字符串内的逗号、换行不算）
    const fields = splitSqlFields(valBody);
    if (fields.length < 9) {
      console.warn(`  ⚠️ 字段数不足: ${fields.length}, 跳过`);
      continue;
    }
    // 字段顺序: mob_id, name, type(丢弃), power, intelligence, quick, stamina, attribute, description, drops
    const mob: ParsedMob = {
      mob_id: unquote(fields[0]),
      name: unquote(fields[1]),
      // fields[2] = type('魔兽') 丢弃
      power: Number(fields[3]),
      intelligence: Number(fields[4]),
      quick: Number(fields[5]),
      stamina: Number(fields[6]),
      attribute: fields[7] === 'NULL' ? null : unquote(fields[7]),
      description: fields[8] === 'NULL' ? '' : unquote(fields[8]),
      drops: fields[9] === 'NULL' ? '[]' : unquote(fields[9]),
    };
    results.push(mob);
  }
  return results;
}

/** 状态机分割 SQL VALUES 字段：逗号分隔，单引号字符串内不切（'' 为转义单引号） */
function splitSqlFields(body: string): string[] {
  const fields: string[] = [];
  let cur = '';
  let inStr = false;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inStr) {
      if (ch === "'") {
        if (body[i + 1] === "'") {
          cur += "''"; // 转义单引号
          i++;
        } else {
          cur += ch;
          inStr = false;
        }
      } else {
        cur += ch;
      }
    } else {
      if (ch === "'") {
        cur += ch;
        inStr = true;
      } else if (ch === ',') {
        fields.push(cur.trim());
        cur = '';
      } else {
        cur += ch;
      }
    }
  }
  if (cur.trim()) fields.push(cur.trim());
  return fields;
}

/** 去掉 SQL 字符串两端的单引号，还原转义的 '' */
function unquote(field: string): string {
  let s = field.trim();
  if (s.startsWith("'") && s.endsWith("'")) {
    s = s.slice(1, -1);
    s = s.replace(/''/g, "'");
  }
  return s;
}

/* ============ alchemy + item 解析 ============ */
interface AlchemyHerb {
  item_id: string;
  name: string;
  tier: number;
  category: string;
  element: Record<string, number>;
  rarity: string;
  habitat: string;
  appearance: string;
  effect: string;
  price: number;
}

/* ============ 主流程 ============ */
async function main() {
  await ds.initialize();
  console.log('✅ 数据库连接成功\n');

  const mobRepo = ds.getRepository(Mob);
  const alchemyRepo = ds.getRepository(Alchemy);
  const itemRepo = ds.getRepository(Item);

  // ---------- 1. 导入 mob ----------
  console.log('[1] 导入魔兽图鉴...');
  const mobSql = readFileSync(
    resolve(__dirname, '..', '..', 'scripts', 'mob_inserts.sql'),
    'utf8',
  );
  const mobs = parseMobInserts(mobSql);
  console.log(`  解析到 ${mobs.length} 条魔兽`);

  let mobInserted = 0;
  let mobSkipped = 0;
  for (const m of mobs) {
    const exist = await mobRepo.findOneBy({ mob_id: m.mob_id });
    if (exist) {
      mobSkipped++;
      continue;
    }
    await mobRepo.save(
      mobRepo.create({
        mob_id: m.mob_id,
        name: m.name,
        description: m.description,
        attribute: m.attribute,
        power: m.power,
        intelligence: m.intelligence,
        quick: m.quick,
        stamina: m.stamina,
        level: 1, // 旧数据无 level，默认 1
        drops: m.drops,
      }),
    );
    mobInserted++;
  }
  console.log(`  ✅ 新增 ${mobInserted} 条，跳过 ${mobSkipped} 条（已存在）\n`);

  // ---------- 2. 导入 alchemy + item ----------
  console.log('[2] 导入草药图鉴...');
  const alchemyJson = readFileSync(
    resolve(__dirname, '..', '..', 'scripts', 'alchemy_data.json'),
    'utf8',
  );
  const alchemyData = JSON.parse(alchemyJson);
  const herbs: AlchemyHerb[] = alchemyData.herbs || [];
  console.log(`  解析到 ${herbs.length} 株草药`);

  let herbAlchemyInserted = 0;
  let herbAlchemySkipped = 0;
  let herbItemInserted = 0;
  let herbItemSkipped = 0;

  for (const h of herbs) {
    // 2a. alchemy 表
    let alch = await alchemyRepo.findOneBy({ item_id: h.item_id });
    if (alch) {
      herbAlchemySkipped++;
    } else {
      alch = await alchemyRepo.save(
        alchemyRepo.create({
          item_id: h.item_id,
          name: h.name,
          tier: h.tier,
          category: h.category || null,
          element: JSON.stringify(h.element),
          rarity: h.rarity || null,
          habitat: h.habitat || null,
          appearance: h.appearance || null,
          effect: h.effect || null,
          price: h.price || 0,
        }),
      );
      herbAlchemyInserted++;
    }

    // 2b. item 表（type='草药', ref_type='alchemy', ref_id=alch.id）
    const existItem = await itemRepo.findOneBy({ item_id: h.item_id });
    if (existItem) {
      herbItemSkipped++;
      continue;
    }
    await itemRepo.save(
      itemRepo.create({
        item_id: h.item_id,
        name: h.name,
        type: '草药',
        icon: null,
        price: h.price || 0,
        description: `${h.effect || ''}（${h.appearance || ''}）`.trim(),
        usable: 0,
        use_effect: null,
        ref_type: 'alchemy',
        ref_id: alch.id,
      }),
    );
    herbItemInserted++;
  }
  console.log(
    `  ✅ alchemy: 新增 ${herbAlchemyInserted}，跳过 ${herbAlchemySkipped} | item: 新增 ${herbItemInserted}，跳过 ${herbItemSkipped}\n`,
  );

  console.log('🎉 导入完成');
  await ds.destroy();
}

main().catch((err) => {
  console.error('❌ 导入失败:', err);
  process.exit(1);
});
