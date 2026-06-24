/**
 * 种子数据：可使用物品 + 对应战斗 buff
 * 运行方式: npx ts-node src/item/seed-usable.ts   (在 dqdl-server 目录下)
 */

import { DataSource } from 'typeorm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { Item } from './item.entity';
import { Buff } from '../buff/buff.entity';
import { BuffEffect } from '../buff/buff-effect.entity';

function loadEnv() {
  const envPath = join(process.cwd(), '.env');
  try {
    const text = readFileSync(envPath, 'utf8');
    for (const line of text.split('\n')) {
      const m = line.match(/^\s*([\w.]+)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] == null) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    }
  } catch {
    console.warn(`⚠ 未读到 ${envPath}，将使用环境变量 / 默认值`);
  }
}

const ITEMS = [
  {
    item_id: 'dy-hcq1', name: '一阶回春丹', type: '丹药', price: 200, usable: true,
    use_effect: JSON.stringify({ type: 'instant', fn: 'heal_hp', params: { amount: 200 } }),
    description: '服用后恢复 200 点生命。',
  },
  {
    item_id: 'dy-bqq1', name: '一阶补气丸', type: '丹药', price: 150, usable: true,
    use_effect: JSON.stringify({ type: 'instant', fn: 'restore_energy', params: { amount: 50 } }),
    description: '服用后恢复 50 点斗气。',
  },
  {
    item_id: 'dy-lhq1', name: '一阶龙虎丹', type: '丹药', price: 300, usable: true,
    use_effect: JSON.stringify({ type: 'buff', buff: 'longhu_t1', scope: 'next_battle' }),
    description: '服用后下次战斗中力量 +20%。',
  },
];

const BUFF = {
  key: 'longhu_t1', name: '龙虎之力', icon: '🐉', type: 'buff',
  duration: 30, stack_rule: 'refresh', max_stack: 1, snapshot: false, priority: 0,
  tags: '[]', description: '力量 +20%（龙虎丹）',
};

async function seed() {
  loadEnv();
  const ds = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_DATABASE || 'dqdl',
    entities: [Item, Buff, BuffEffect],
    synchronize: true,
  });

  await ds.initialize();
  console.log('✅ 数据库连接成功');

  const itemRepo = ds.getRepository(Item);
  const buffRepo = ds.getRepository(Buff);
  const effectRepo = ds.getRepository(BuffEffect);

  // 1. 物品
  console.log('\n[1] 可使用物品...');
  for (const data of ITEMS) {
    let row = await itemRepo.findOneBy({ item_id: data.item_id });
    if (row) {
      await itemRepo.update(row.id, data);
      console.log(`  = 更新: ${data.name} (${data.item_id})`);
    } else {
      row = itemRepo.create(data);
      await itemRepo.save(row);
      console.log(`  + 创建: ${data.name} (${data.item_id})`);
    }
  }

  // 2. buff 定义
  console.log('\n[2] 战斗 buff...');
  let buff = await buffRepo.findOneBy({ key: BUFF.key });
  if (buff) {
    await buffRepo.update(buff.id, BUFF);
    console.log(`  = 更新: ${BUFF.name} (${BUFF.key})`);
  } else {
    buff = buffRepo.create(BUFF);
    buff = await buffRepo.save(buff);
    console.log(`  + 创建: ${BUFF.name} (${BUFF.key})`);
  }

  // 3. buff 效果（力量 +20%）
  console.log('\n[3] buff 效果...');
  const effectData = {
    buffId: buff.id,
    hook: 'passive',
    fnId: 'stat',
    params: JSON.stringify({ attr: 'power', op: 'mul', value: 0.2 }),
    priority: 0,
    consume: false,
  };
  let effect = await effectRepo.findOneBy({ buffId: buff.id, hook: 'passive', fnId: 'stat' });
  if (effect) {
    await effectRepo.update(effect.id, effectData);
    console.log(`  = 更新: passive/stat power mul 0.2`);
  } else {
    effect = effectRepo.create(effectData);
    await effectRepo.save(effect);
    console.log(`  + 创建: passive/stat power mul 0.2`);
  }

  console.log('\n✅ 种子完成。请重启 dqdl-server 以重新加载 buff 定义。');
  await ds.destroy();
}

seed().catch((err) => {
  console.error('❌ 种子失败:', err);
  process.exit(1);
});
