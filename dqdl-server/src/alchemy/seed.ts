/**
 * 种子数据：炼丹系统（草药 / 丹药 / 丹炉 / 丹方 / buff）+ 更新炼药师 NPC 配置
 * 数据源：../../scripts/alchemy_data.json（单一源，与 build_alchemy_docx.py 共用）
 * 运行: 在 dqdl-server 目录下  npx ts-node src/alchemy/seed.ts
 */
import { DataSource } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Item } from '../item/item.entity';
import { Player } from '../player/player.entity';
import { PillRecipe } from './pill-recipe.entity';
import { Buff } from '../buff/buff.entity';
import { BuffEffect } from '../buff/buff-effect.entity';

interface AlchemyData {
  herbs: any[];
  pills: any[];
  furnaces: any[];
  recipes: any[];
  buffs: any[];
}

function loadEnv() {
  const envPath = join(process.cwd(), '.env');
  try {
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    console.warn(`未读到 ${envPath}，使用环境变量 / 默认值`);
  }
}

async function seed() {
  loadEnv();
  const dataPath = join(process.cwd(), '..', 'scripts', 'alchemy_data.json');
  const data: AlchemyData = JSON.parse(readFileSync(dataPath, 'utf8'));

  const ds = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'dqdl',
    entities: [Item, Player, PillRecipe, Buff, BuffEffect],
    synchronize: true,
  });
  await ds.initialize();
  console.log('✅ 数据库连接成功');

  const itemRepo = ds.getRepository(Item);
  const recipeRepo = ds.getRepository(PillRecipe);
  const buffRepo = ds.getRepository(Buff);
  const effectRepo = ds.getRepository(BuffEffect);

  const upsertItem = async (row: Partial<Item>) => {
    let exist = await itemRepo.findOneBy({ item_id: row.item_id! });
    if (exist) {
      await itemRepo.update(exist.id, row);
      console.log(`  = 更新物品: ${row.name} (${row.item_id})`);
    } else {
      await itemRepo.save(itemRepo.create(row as Item));
      console.log(`  + 创建物品: ${row.name} (${row.item_id})`);
    }
  };

  // 1. 草药
  console.log('\n[1] 草药 ...');
  for (const h of data.herbs) {
    await upsertItem({
      item_id: h.item_id,
      name: h.name,
      type: '草药',
      price: h.price,
      description: `${h.effect}（${h.rarity}·${h.tier}阶）`,
      usable: false,
      element_energy: JSON.stringify(h.element),
      alchemy_tier: h.tier,
      furnace_spec: null,
    });
  }

  // 2. 丹药（产出）
  console.log('\n[2] 丹药 ...');
  for (const p of data.pills) {
    await upsertItem({
      item_id: p.item_id,
      name: p.name,
      type: '丹药',
      price: p.price,
      description: p.desc,
      usable: !!p.usable,
      use_effect: JSON.stringify(p.use_effect),
      element_energy: null,
      alchemy_tier: p.tier,
      furnace_spec: null,
    });
  }

  // 3. 丹炉
  console.log('\n[3] 丹炉 ...');
  for (const f of data.furnaces) {
    await upsertItem({
      item_id: f.item_id,
      name: f.name,
      type: '丹炉',
      price: f.price,
      description: f.desc,
      usable: false,
      element_energy: null,
      alchemy_tier: f.tier,
      furnace_spec: JSON.stringify(f.spec),
    });
  }

  // 4. 丹方
  console.log('\n[4] 丹方 ...');
  for (const r of data.recipes) {
    let exist = await recipeRepo.findOneBy({ recipe_id: r.recipe_id });
    const row = {
      recipe_id: r.recipe_id,
      output_item_id: r.output_item_id,
      name: r.name,
      tier: r.tier,
      required: JSON.stringify(r.required),
      tolerance: JSON.stringify(r.tolerance),
      min_furnace_tier: r.min_furnace_tier,
      base_yield: r.base_yield,
      price: r.price,
    };
    if (exist) {
      await recipeRepo.update(exist.id, row);
      console.log(`  = 更新丹方: ${r.name} (${r.recipe_id})`);
    } else {
      await recipeRepo.save(recipeRepo.create(row));
      console.log(`  + 创建丹方: ${r.name} (${r.recipe_id})`);
    }
  }

  // 5. buff（清心/增力/雷火）
  console.log('\n[5] buff ...');
  for (const b of data.buffs) {
    let buff = await buffRepo.findOneBy({ key: b.key });
    const buffRow: Partial<Buff> = {
      key: b.key,
      name: b.name,
      icon: b.icon,
      type: 'buff',
      duration: 30,
      stack_rule: 'refresh',
      max_stack: 1,
      snapshot: false,
      priority: 0,
      tags: '[]',
      description: b.description,
    };
    if (buff) {
      await buffRepo.update(buff.id, buffRow);
      console.log(`  = 更新 buff: ${b.name} (${b.key})`);
    } else {
      buff = await buffRepo.save(buffRepo.create(buffRow as Buff));
      console.log(`  + 创建 buff: ${b.name} (${b.key})`);
    }
    // 效果
    for (const e of b.effects) {
      const effRow = {
        buffId: buff.id,
        hook: e.hook,
        fnId: e.fnId,
        params: JSON.stringify(e.params),
        priority: 0,
        consume: false,
      };
      let eff = await effectRepo.findOneBy({ buffId: buff.id, hook: e.hook, fnId: e.fnId });
      if (eff) {
        await effectRepo.update(eff.id, effRow);
      } else {
        await effectRepo.save(effectRepo.create(effRow));
      }
    }
    console.log(`    -> ${b.effects.length} 条效果`);
  }

  // 6. 更新炼药师 NPC：在丹房(alchemy)地点固定出现
  console.log('\n[6] 炼药师 NPC ...');
  await ds.query(
    `UPDATE npc_role SET required_in_loc_type = ?, prompt_hint = ? WHERE name = '炼药师'`,
    [
      JSON.stringify(['alchemy', '丹房', '炼药师公会']),
      '你是驻场丹房的炼药师，精通炼丹之道，可以鉴定丹药、出售丹方与草药、指点炼药技巧，语气从容专业。',
    ],
  );
  const row = await ds.query(`SELECT name, required_in_loc_type FROM npc_role WHERE name = '炼药师'`);
  console.log('  炼药师已更新:', row[0]);

  console.log('\n✅ 炼丹种子完成。');
  await ds.destroy();
}

seed().catch((err) => {
  console.error('❌ 种子失败:', err);
  process.exit(1);
});
