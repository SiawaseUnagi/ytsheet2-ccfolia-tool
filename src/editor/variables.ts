import { CORE_STATUS_LABELS as BASE_STATUS_LABELS } from "../resources/labels";
import { DEFAULT_CONSUMABLES } from "../items/consumables";
type NamedValue = { label?: unknown };
const DEFAULT_CONSUMABLE_LABELS = DEFAULT_CONSUMABLES.map((item) => item.label);
function labelOf(item: unknown): string | null {
  const label = (item as NamedValue)?.label;
  return typeof label === "string" && label.trim() ? label.trim() : null;
}
function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
export function buildVariableText(
  status: unknown[],
  params: unknown[],
  skillNames: string[],
  isCurrentConsumableLabel: (label: string) => boolean,
): string {
  const statusLabels = unique(status.map(labelOf).filter((v): v is string => !!v)),
    paramLabels = unique(params.map(labelOf).filter((v): v is string => !!v));
  const consumableLabels = statusLabels.filter(isCurrentConsumableLabel),
    extraStatusFlags = statusLabels.filter(
      (label) => !BASE_STATUS_LABELS.includes(label) && !isCurrentConsumableLabel(label),
    );
  const allSkillFlags = unique([...skillNames, ...extraStatusFlags]),
    optionalConsumableLabels = consumableLabels.filter(
      (label) => !DEFAULT_CONSUMABLE_LABELS.includes(label),
    );
  const lines = [
    "### ■よく使う補正",
    "{判定BD}D",
    "{命中BD}D",
    "{回避BD}D",
    "{ダメBD}D",
    "{ダメバフ}",
    "{強心丹D}",
    ":強心丹D=1",
    ":強心丹D=0",
    "",
    "### ■ダメージ属性",
    "{ダメージ属性}",
  ];
  if (allSkillFlags.length) {
    lines.push("", "### ■スキル・フラグ候補");
    for (const label of allSkillFlags)
      lines.push(`{${label}}`, `{${label}}D`, `:${label}=1`, `:${label}=0`);
  }
  if (optionalConsumableLabels.length) {
    lines.push("", "### ■消耗品コマンド");
    for (const label of optionalConsumableLabels) lines.push(`:${label}-1`);
  }
  lines.push("", "### ■基本ステータス");
  for (const label of statusLabels) lines.push(`{${label}}`);
  lines.push("", "### ■判定・能力値");
  for (const label of paramLabels) lines.push(`{${label}}`);
  lines.push(
    "",
    "### ■式の部品",
    "({命中ダイス}+{判定BD}+{命中BD})D+{命中}",
    "({回避ダイス}+{判定BD}+{回避BD})D+{回避}",
    "({魔術判定ダイス}+{判定BD}+{命中BD})D+{魔術判定}",
    "({攻撃ダイス}+{ダメBD})D+{攻撃力}+{ダメバフ}",
    "c(-{物理防御力})",
    "c(-{魔法防御力})",
  );
  return lines.join("\n");
}
