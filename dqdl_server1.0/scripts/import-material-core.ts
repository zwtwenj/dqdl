/**
 * 一次性导入脚本：材料图鉴 → material 表，魔核图鉴 → magic_core 表，并同步写入 item 镜像。
 *
 * 数据源（由 scripts/extract_material_core.py 从 rag/*.docx 生成）：
 *   - D:\text\icarus-models\dqdl\scripts\material_data_v2.json   (517 条材料)
 *   - D:\text\icarus-models\dqdl\scripts\magic_core_data.json    (72 条魔核)
 *
 * 运行：npx ts-node scripts/import-material-core.ts
 *
 * 幂等：先按 item_id 查重，已存在则跳过（不覆盖）。
 * item 表镜像：type='材料'/'魔核'，ref_type 指向专用表，ref_id 指向专用表自增 id。
 *   材料无价格源，item.price 统一默认 50 金（出售价 25 金，后续可按 rarity 细化）；魔核 item.price 取 (price_min+price_max)/2 向下取整。
 */
import 'reflect-metadata';
import { config } from 'dotenv';
import { resolve } from 'path';
import { DataSource } from 'typeorm';
import { readFileSync } from 'fs';
import { Material } from '../src/material/material.entity';
import { MagicCore } from '../src/magic_core/magic_core.entity';
import { Item } from '../src/item/item.entity';

config({ path: resolve(__dirname, '..', '.env') });

const ds = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT) || 3306,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: [Material, MagicCore, Item],
  synchronize: false,
});

/* ============ 材料数据类型 ============ */
interface MaterialData {
  item_id: string;
  name: string;
  rarity: string | null;
  source_mobs: { mob_id: string; name: string }[];
  description: string | null;
}

/* ============ 魔核数据类型 ============ */
interface MagicCoreData {
  item_id: string;
  name: string;
  attribute: string;
  tier: number;
  quality: string;
  appearance: string | null;
  drop_source: string | null;
  price_min: number;
  price_max: number;
  usage_desc: string | null;
}

/* ============ 主流程 ============ */
async function main() {
  await ds.initialize();
  console.log('✅ 数据库连接成功\n');

  const materialRepo = ds.getRepository(Material);
  const coreRepo = ds.getRepository(MagicCore);
  const itemRepo = ds.getRepository(Item);

  // ---------- 1. 导入材料 ----------
  console.log('[1] 导入材料图鉴...');
  const materialJson = readFileSync(
    resolve(__dirname, '..', '..', 'scripts', 'material_data_v2.json'),
    'utf8',
  );
  const materials: MaterialData[] = JSON.parse(materialJson);
  console.log(`  解析到 ${materials.length} 条材料`);

  let matInserted = 0;
  let matSkipped = 0;
  for (const m of materials) {
    // material 表查重
    const existMat = await materialRepo.findOneBy({ item_id: m.item_id });
    let matId: number;
    if (existMat) {
      matId = existMat.id;
      matSkipped++;
    } else {
      const saved = await materialRepo.save(
        materialRepo.create({
          item_id: m.item_id,
          name: m.name,
          rarity: m.rarity || null,
          source_mobs: JSON.stringify(m.source_mobs || []),
          description: m.description || null,
        }),
      );
      matId = saved.id;
      matInserted++;
    }

    // item 镜像查重（type='材料', ref_type='material', ref_id=matId）
    const existItem = await itemRepo.findOneBy({ item_id: m.item_id });
    if (existItem) {
      continue;
    }
    await itemRepo.save(
      itemRepo.create({
        item_id: m.item_id,
        name: m.name,
        type: '材料',
        icon: null,
        price: 50, // 材料无价格源，统一默认价 50 金（出售价 25 金），后续可按 rarity 细化
        description: m.description || null,
        usable: 0,
        use_effect: null,
        ref_type: 'material',
        ref_id: matId,
      }),
    );
  }
  console.log(`  ✅ material: 新增 ${matInserted}，跳过 ${matSkipped}（已存在）\n`);

  // ---------- 2. 导入魔核 ----------
  console.log('[2] 导入魔核图鉴...');
  const coreJson = readFileSync(
    resolve(__dirname, '..', '..', 'scripts', 'magic_core_data.json'),
    'utf8',
  );
  const cores: MagicCoreData[] = JSON.parse(coreJson);
  console.log(`  解析到 ${cores.length} 条魔核`);

  let coreInserted = 0;
  let coreSkipped = 0;
  for (const c of cores) {
    // magic_core 表查重
    const existCore = await coreRepo.findOneBy({ item_id: c.item_id });
    let coreId: number;
    if (existCore) {
      coreId = existCore.id;
      coreSkipped++;
    } else {
      const saved = await coreRepo.save(
        coreRepo.create({
          item_id: c.item_id,
          name: c.name,
          attribute: c.attribute,
          tier: c.tier,
          quality: c.quality,
          appearance: c.appearance || null,
          drop_source: c.drop_source || null,
          price_min: c.price_min || 0,
          price_max: c.price_max || 0,
          usage_desc: c.usage_desc || null,
        }),
      );
      coreId = saved.id;
      coreInserted++;
    }

    // item 镜像查重
    const existItem = await itemRepo.findOneBy({ item_id: c.item_id });
    if (existItem) {
      continue;
    }
    const price = Math.floor((c.price_min + c.price_max) / 2);
    const desc = [c.appearance, c.usage_desc].filter(Boolean).join('；');
    await itemRepo.save(
      itemRepo.create({
        item_id: c.item_id,
        name: c.name,
        type: '魔核',
        icon: null,
        price,
        description: desc || null,
        usable: 0,
        use_effect: null,
        ref_type: 'magic_core',
        ref_id: coreId,
      }),
    );
  }
  console.log(`  ✅ magic_core: 新增 ${coreInserted}，跳过 ${coreSkipped}（已存在）\n`);

  console.log('🎉 导入完成');
  await ds.destroy();
}

main().catch((err) => {
  console.error('❌ 导入失败:', err);
  process.exit(1);
});
