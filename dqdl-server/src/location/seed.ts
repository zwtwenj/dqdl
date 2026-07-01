/**
 * 种子数据：初始化固定地图节点 + 生成规则
 * 运行方式: npx ts-node src/location/seed.ts
 */

import { DataSource } from 'typeorm';
import { Location } from './location.entity';
import { LocationGenRule } from './location-gen-rule.entity';
import { dbOptions } from '../db.config';

async function seed() {
  const ds = new DataSource(dbOptions([Location, LocationGenRule]));

  await ds.initialize();
  console.log('✅ 数据库连接成功');

  const locRepo = ds.getRepository(Location);
  const ruleRepo = ds.getRepository(LocationGenRule);

  // ========== 1. 固定地图节点 ==========
  console.log('\n[1] 检查固定节点...');

  const fixedNodes = [
    { name: '斗气大陆', loc_type: 'continent', depth: 0, is_fixed: 1, is_expanded: 1, danger_level: 0, description: '斗气大陆，强者为尊的世界' },
    { name: '西北区域', loc_type: 'region', depth: 1, is_fixed: 1, is_expanded: 0, danger_level: 0, description: '斗气大陆西北方，位置偏僻但势力盘根错节' },
    { name: '中州', loc_type: 'region', depth: 1, is_fixed: 1, is_expanded: 0, danger_level: 0, description: '斗气大陆最繁华的核心区域，强者云集' },
    { name: '黑角域', loc_type: 'region', depth: 1, is_fixed: 1, is_expanded: 0, danger_level: 3, description: '斗气大陆最混乱的三不管地带' },
    { name: '隐秘空间界', loc_type: 'region', depth: 1, is_fixed: 1, is_expanded: 0, danger_level: 5, description: '远古八族等顶级势力隐居的独立空间' },
  ];

  // 先创建根节点
  let continent = await locRepo.findOne({ where: { name: '斗气大陆', depth: 0 } });
  if (!continent) {
    continent = locRepo.create(fixedNodes[0] as Partial<Location>);
    continent.parent_id = null;
    continent = await locRepo.save(continent);
    console.log(`  + 创建: ${continent.name} (id=${continent.id})`);
  } else {
    console.log(`  = 已存在: ${continent.name} (id=${continent.id})`);
  }

  // 创建区域节点
  for (const node of fixedNodes.slice(1)) {
    const existing = await locRepo.findOne({ where: { name: node.name, depth: node.depth } });
    if (!existing) {
      const loc = locRepo.create(node as Partial<Location>);
      loc.parent_id = continent.id;
      await locRepo.save(loc);
      console.log(`  + 创建: ${loc.name}`);
    } else {
      console.log(`  = 已存在: ${existing.name}`);
    }
  }

  // ========== 2. 生成规则 ==========
  console.log('\n[2] 检查生成规则...');

  const rules: Partial<LocationGenRule>[] = [
    {
      depth: 2,
      loc_type: 'empire',
      min_children: 2,
      max_children: 5,
      naming_style: '帝国/王国名，参考中国古代诸侯国名，如加玛帝国、出云帝国',
      danger_range: '1-3',
      world_constraints: '每个帝国应该有独特特色（军事/商业/中立/神秘）。帝国之间可以有敌对或同盟关系。',
      gen_prompt: `你是斗气大陆的世界观设计师。请为"{parent_name}"区域生成{count}个帝国或大型势力范围。

【严格约束】
- 名称必须是中文，风格：{naming_style}
- 每个帝国必须包含：名称、类型、一句话描述、势力特征
- 必须符合斗气大陆的世界观（修炼体系、强者为尊）
- {forbidden}
- {world_constraints}

【输出格式】只输出JSON数组
[
  {
    "name": "帝国名",
    "loc_type": "empire",
    "description": "一句话描述这个帝国的特色",
    "danger_level": 1,
    "tags": ["军事型/商业型/中立型/神秘型"]
  }
]`,
    },
    {
      depth: 3,
      loc_type: 'mixed',
      min_children: 3,
      max_children: 7,
      naming_style: '城市、山脉、宗派、秘境名，风格参考仙侠小说',
      danger_range: '1-3',
      world_constraints: '必须包含至少1个城市、1个野外、1个宗派或秘境。类型分布：city/wild/sect/secret。野外(wild)的danger_level只能是1-3，1=一阶魔兽区，2=二阶魔兽区，3=三阶魔兽区。城市danger_level为0。',
      gen_prompt: `你是斗气大陆的世界观设计师。请为"{parent_name}"（{parent_description}）生成{count}个地点。

【地点类型】每个地点必须是以下之一：
- city: 城市（有人聚居、有交易）
- wild: 野外（魔兽栖息、危险但有资源）
- sect: 宗派驻地（势力总部）
- secret: 秘境/遗迹（特殊地点，稀有）

【严格约束】
- 名称必须符合斗气大陆仙侠风格
- 至少包含1个city类型和1个wild类型
- 危险等级范围：{danger_range}（野外danger_level只允许1-3，城市为0）
- 野外danger_level含义：1=一阶魔兽区，2=二阶魔兽区，3=三阶魔兽区
- {forbidden}

【输出格式】只输出JSON数组
[
  {
    "name": "地点名",
    "loc_type": "city/wild/sect/secret",
    "description": "一句话描述",
    "danger_level": 1,
    "available_actions": ["buy","sell","quest","train","fight","explore"],
    "tags": ["特色标签"]
  }
]`,
    },
    {
      depth: 4,
      loc_type: 'district',
      min_children: 2,
      max_children: 5,
      naming_style: '区域内景点名，如坊市、佣兵公会、药材商行、修炼场',
      danger_range: '1-3',
      world_constraints: '区域类型要与父节点匹配：城市内是功能区域，野外内是野外深处，宗派内是功能区域。野外(wild2)的danger_level只能是1-3，继承父级wild的danger_level。非野外区域danger_level为0。',
      gen_prompt: `你是斗气大陆的世界观设计师。请为"{parent_name}"（{parent_description}）生成{count}个内部区域。

【区域类型】根据父节点类型选择：
城市(city)内部：坊市、佣兵公会、拍卖场、药材商行、冶炼坊、丹房、家族宅邸、地下黑市、城主府、修炼室、修炼场
（其中"坊市"、"佣兵公会"、"丹房"为每个城市必须且只能各包含一个的核心功能地点，不得生成铁血佣兵公会、佣兵分舵、西坊市、炼丹分堂等同功能变体名称）
野外(wild)内部：必须是更深层的野外区域，如入口区、深处、核心区、隐藏洞穴、稀有资源点、瀑布、古树群
宗派(sect)内部：外门、内门、藏经阁、练功场、长老殿、丹房、禁地
秘境(secret)内部：前厅、核心区域、守护者区域、宝物室、迷宫通道

【严格约束】
- 至少包含1个功能性区域（可交易/接任务/修炼）
- 区域类型必须与父节点匹配
- 坊市/交易场所 loc_type="market"；修炼室/修炼场 loc_type="cultivation"；冶炼坊/锻造坊 loc_type="forging"；丹房 loc_type="alchemy"；其余城市内部区域用 "district"
- 每个城市必须且只能各包含一个 loc_type="market" 的"坊市"、一个"佣兵公会"、一个 loc_type="alchemy" 的"丹房"，严禁出现同功能重复或变体（如铁血佣兵公会、佣兵分舵、西坊市、丹房分堂等）
- {forbidden}
- 如果父节点是野外类型，loc_type必须设为"wild2"，danger_level继承父节点（1-3）
- 非野外区域danger_level设为0

【输出格式】只输出JSON数组
[
  {
    "name": "区域名",
    "loc_type": "district",
    "description": "一句话描述",
    "danger_level": 1,
    "available_actions": ["buy","sell","quest","train","fight","explore","rest"],
    "tags": ["标签"]
  }
]`,
    },
    {
      depth: 5,
      loc_type: 'scene',
      min_children: 2,
      max_children: 4,
      naming_style: '具体场景名，如某个摊位、某个房间、某棵树旁',
      danger_range: '1-3',
      world_constraints: '场景是最细粒度的地点，应该有具体的交互对象。如：炼药炉旁、悬赏牌前、老者摊位。野外(wild3)的danger_level只能是1-3，继承父级wild2的danger_level。非野外场景danger_level为0。',
      gen_prompt: `你是斗气大陆的世界观设计师。请为"{parent_name}"（{parent_description}）生成{count}个具体场景。

【场景是最细粒度的地点】
每个场景应该有具体的交互对象或事件触发点。

【严格约束】
- 场景名称要具体，如“悬赏牌前”、“炼药炉旁”、“密林深处”
- 每个场景应该暗示可能的交互
- {forbidden}
- 如果父节点是wild2类型，loc_type必须设为"wild3"，danger_level继承父节点（1-3）
- 非野外场景danger_level设为0

【输出格式】只输出JSON数组
[
  {
    "name": "场景名",
    "loc_type": "scene",
    "description": "一句话描述",
    "danger_level": 1,
    "available_actions": ["buy","sell","quest","train","fight","explore","rest","gather"],
    "tags": ["标签"]
  }
]`,
    },
  ];

  for (const rule of rules) {
    const existing = await ruleRepo.findOne({ where: { depth: rule.depth } });
    if (!existing) {
      const r = ruleRepo.create(rule);
      await ruleRepo.save(r);
      console.log(`  + 创建规则: depth=${rule.depth} (${rule.loc_type})`);
    } else {
      // 更新 prompt 等字段
      existing.gen_prompt = rule.gen_prompt || '';
      existing.naming_style = rule.naming_style || '';
      existing.danger_range = rule.danger_range || '';
      existing.world_constraints = rule.world_constraints || '';
      existing.min_children = rule.min_children ?? 2;
      existing.max_children = rule.max_children ?? 6;
      await ruleRepo.save(existing);
      console.log(`  = 更新规则: depth=${rule.depth}`);
    }
  }

  console.log('\n✅ 种子数据初始化完成');
  await ds.destroy();
}

seed().catch((err) => {
  console.error('种子数据初始化失败:', err);
  process.exit(1);
});
