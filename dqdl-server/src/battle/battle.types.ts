export type Hook =
  | 'onTurnStart' | 'onTurnEnd'
  | 'beforeAttack' | 'afterAttack'
  | 'beforeHit' | 'afterHit'
  | 'passive';

export type Side = 'player' | 'mob';

export interface Attrs {
  power: number;
  intelligence: number;
  quick: number;
  stamina: number;
  crit_rate: number;
  [k: string]: number;
}

export interface Combatant {
  uid: number;
  side: Side;
  name: string;
  level: number;
  base: Attrs;
  hp: number;
  maxHp: number;
  energy: number;
  maxEnergy: number;
  skipEnergy: boolean;
  buffs: ActiveBuff[];
}

export interface ActiveBuff {
  uid: number;
  key: string;
  buffId: number;
  level: number;
  remaining: number;
  stacks: number;
  source: Combatant;
  snapshot: Attrs | null;
  consumed: boolean;
  params?: Record<string, any>;
}

export interface AttackEvent {
  source: Combatant;
  target: Combatant;
  baseDamage: number;
  finalDamage: number;
  damageMul: number;
  reduction: number;
  armorPen: number;
  crit: boolean;
  canceled: boolean;
  payload: Record<string, number>;
}

export interface SkillEffectEntry {
  buff: string;
  paramKey?: string;
  level?: number;
}

export interface Ctx {
  source: Combatant;
  target: Combatant;
  self: Combatant;
  atk: AttackEvent | null;
  bus: EventBus;
  log: string[];
}

export interface Letter {
  id: number;
  from: Combatant;
  to: Combatant;
  hook: Hook;
  kind: string;
  value?: number;
  snapshot?: Attrs | null;
  resolve?: (ctx: Ctx) => void;
}

export interface EffectRow {
  hook: Hook;
  fnId: string;
  params: any;
  priority: number;
  consume: boolean;
}

export interface BuffDef {
  id: number;
  key: string;
  name: string;
  icon: string;
  type: string;
  duration: number;
  stackRule: string;
  maxStack: number;
  snapshot: boolean;
  priority: number;
  tags: string[];
  effects: EffectRow[];
}

export interface BattleState {
  player: Combatant;
  mob: Combatant;
  bus: EventBus;
  log: string[];
  over: boolean;
  winner: Side | null;
  skills: ResolvedSkill[];
}

export interface ResolvedSkill {
  id: number;
  name: string;
  attr: string;
  scalingRate: number;
  baseDamage: number;
  energyCost: number;
  params: Record<string, number>;
  carried: SkillEffectEntry[];
  deliver: SkillEffectEntry[];
  selfBuffs: SkillEffectEntry[];
}

export const MAX_DEPTH = 8;

let _lid = 0;
export const nextId = () => ++_lid;

export class EventBus {
  letters: Letter[] = [];
  eventLog: any[] = [];
  depth = 0;

  post(l: Omit<Letter, 'id'>) {
    if (this.depth >= MAX_DEPTH) return;
    const letter = { ...l, id: nextId() } as Letter;
    this.letters.push(letter);
    this.eventLog.push({ t: 'post', id: letter.id, from: l.from?.name, to: l.to?.name, hook: l.hook, kind: l.kind });
  }

  drain(unit: Combatant, hook: Hook): Letter[] {
    const out: Letter[] = [];
    for (let i = 0; i < this.letters.length;) {
      const l = this.letters[i];
      if (l.to === unit && l.hook === hook) { out.push(l); this.letters.splice(i, 1); } else i++;
    }
    return out;
  }
}
