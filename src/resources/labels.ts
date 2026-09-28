export const NUMERIC_FLAGS = ["判定BD", "命中BD", "回避BD", "ダメBD", "ダメバフ", "強心丹D"];
export const CORE_STATUS_LABELS = [
  "HP",
  "MP",
  "フェイト",
  "移動力",
  "物理防御力",
  "魔法防御力",
  "携帯可能重量",
  ...NUMERIC_FLAGS,
  "EP",
  "所持金",
];
export const RESERVED_FLAG_LABELS = new Set([...CORE_STATUS_LABELS, "CL", "initiative", "攻撃力"]);
