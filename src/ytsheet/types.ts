export type YtSkill = {
  name: string;
  level: number;
  timing: string;
  judge: string;
  target: string;
  range: string;
  cost: string;
  usage: string;
  effect: string;
};

export type WeaponData = { name: string; hit: number; hitDice: number; atk: number; atkDice: number; weaponAtk: number };

export type ParsedSheet = {
  raw: Record<string, unknown>;
  name: string;
  baseUrl: string;
  hp: number;
  mp: number;
  fate: number;
  move: number;
  initiative: number;
  phyDef: number;
  magDef: number;
  carry: number;
  abilities: Record<string, number>;
  skills: YtSkill[];
  weapons: WeaponData[];
  warnings: string[];
};

export type CustomSkillCommand = {
  use?: string[];
  reset?: string[];
  reference?: boolean;
  status?: { label?: string; initial?: number; max?: number };
};

export type CustomCommandMap = Record<string, CustomSkillCommand>;
