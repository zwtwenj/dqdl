/**
 * 种子数据：场景事件
 * 运行方式: npx ts-node src/random-event/seed.ts
 */
import { DataSource } from 'typeorm';
import { RandomEvent } from './random-event.entity';
import { dbOptions } from '../db.config';

async function seed() {
  const ds = new DataSource(dbOptions([RandomEvent]));

  await ds.initialize();
  console.log('✅ 数据库连接成功');
  const repo = ds.getRepository(RandomEvent);

  const events: Partial<RandomEvent>[] = [
    {
      event_id: 'shady_pill_seller',
      title: '坊市奇遇',
      trigger_type: 'enter_location',
      chance: 0.1,
      conditions: JSON.stringify({ locType: ['market'] }),
      weight: 0,
      enabled: 1,
      nodes: JSON.stringify({
        start: 'intro',
        map: {
          intro: {
            npc:
              '一个长相猥琐的男人鬼鬼祟祟地凑上前来，压低声音道：\n"道友，可要些好东西？我这有一炉未知丹药，只要1000金币，保你受益匪浅。"',
            choices: [
              { text: '花1000金币买下', require: { money: 1000 }, goto: 'buy' },
              { text: '不买，转身离开', goto: 'leave' },
            ],
          },
          buy: {
            effects: [{ money: -1000 }],
            roll: [
              { weight: 50, goto: 'buy_good' },
              { weight: 50, goto: 'buy_bad' },
            ],
          },
          buy_good: {
            effects: [{ giveItem: { name: '一品回气丹', count: 10 } }],
            npc: '你接过布包，丹药香气扑鼻——货真价实！再抬头，那人已混入人群不见了踪影。',
            end: true,
          },
          buy_bad: {
            effects: [{ giveItem: { name: '废丹', count: 1 } }],
            npc: '你仔细查看包裹中的丹药，却发现这只是一炉废丹而已，转身望去，已经不见那人的身影。',
            end: true,
          },
          leave: {
            npc: '你摇了摇头。那人撇撇嘴，转身寻找下一位买家去了。',
            end: true,
          },
        },
      }),
    },
  ];

  for (const ev of events) {
    const existing = await repo.findOne({ where: { event_id: ev.event_id } });
    if (existing) {
      Object.assign(existing, ev);
      await repo.save(existing);
      console.log(`  = 更新事件: ${ev.event_id}`);
    } else {
      await repo.save(repo.create(ev));
      console.log(`  + 创建事件: ${ev.event_id}`);
    }
  }

  console.log('\n✅ 场景事件种子数据初始化完成');
  await ds.destroy();
}

seed().catch((err) => {
  console.error('种子数据初始化失败:', err);
  process.exit(1);
});
