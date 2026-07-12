import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, In } from 'typeorm';
import { NpcShop } from './shop.entity';
import { Item } from '../item/item.entity';
import { StaticNpc } from '../npc/static-npc.entity';
import { Biz } from '../common/biz.exception';

/**
 * 商店服务：商品查询（npc_role 维度配货）。
 * 查 NPC → 取 role_id → 查 npc_shop → join item 返回商品列表。
 * 购买/出售逻辑暂未实现（按钮置灰，留接口位）。
 */
@Injectable()
export class ShopService {
  constructor(
    @InjectRepository(NpcShop)
    private readonly shopRepo: Repository<NpcShop>,
    @InjectRepository(Item)
    private readonly itemRepo: Repository<Item>,
    @InjectRepository(StaticNpc)
    private readonly npcRepo: Repository<StaticNpc>,
  ) {}

  /** 按 NPC 查商品（查 NPC→role→配货+item 详情） */
  async getShopByNpc(npcId: number): Promise<{
    npcName: string;
    roleId: number;
    items: any[];
  }> {
    const npc = await this.npcRepo.findOneBy({ id: npcId });
    if (!npc) throw Biz.notFound(`NPC ${npcId} 不存在`);
    const items = await this.getShopByRoleId(npc.role_id);
    return { npcName: npc.name, roleId: npc.role_id, items };
  }

  /** 按 role_id 查商品（join item，返回前端渲染所需字段） */
  async getShopByRoleId(roleId: number): Promise<any[]> {
    const rows = await this.shopRepo.find({
      where: { role_id: roleId },
      order: { sort: 'ASC', id: 'ASC' },
    });
    if (rows.length === 0) return [];
    const items = await this.itemRepo.find({
      where: { item_id: In(rows.map((r) => r.item_id)) },
    });
    const itemMap = new Map(items.map((it) => [it.item_id, it]));
    // 保持 npc_shop.sort 排序，缺 item 的配货跳过
    return rows
      .map((r) => {
        const it = itemMap.get(r.item_id);
        if (!it) return null;
        return {
          item_id: it.item_id,
          name: it.name,
          type: it.type,
          icon: it.icon,
          price: it.price,
          description: it.description,
          sort: r.sort,
        };
      })
      .filter(Boolean);
  }
}
