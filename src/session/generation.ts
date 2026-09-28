import { GENERATOR_VERSION } from "./baseline";
import { generateSessionBase } from "../output/generator";
export { generateSessionBase } from "../output/generator";
export { characterJson, metadataOnly } from "../ccfolia/serialization";
import { parseYtsheet } from "../ytsheet/parseYtsheet";
import { assertSheetIdentity, type Snapshot } from "./model";
import { mergeText, mergeRows, mergeMetadata, type Choices, type Conflict } from "./merge";

export function planSessionUpdate(
  old: Snapshot,
  raw: Record<string, unknown>,
  choices: Choices = {},
) {
  if (assertSheetIdentity(raw, old.url) !== old.key)
    throw new Error("別のキャラクターへの上書きは行いません。");
  const fresh = generateSessionBase(raw, old.url, old.useFormula, old.calculation);
  const status = mergeRows(
    old.base.statusEdit,
    old.working.statusEdit,
    fresh.fields.statusEdit,
    "ステータス",
    3,
    fresh.reset,
    choices,
  );
  const params = mergeRows(
    old.base.paramsEdit,
    old.working.paramsEdit,
    fresh.fields.paramsEdit,
    "パラメータ",
    2,
    new Map(),
    choices,
  );
  const palette = mergeText(
    old.base.palette,
    old.working.palette,
    fresh.fields.palette,
    "チャットパレット",
    choices,
  );
  const meta = mergeMetadata(
    old.base.metadata,
    old.working.metadata,
    fresh.fields.metadata,
    choices,
  );
  const conflicts: Conflict[] = [
    ...status.conflicts,
    ...params.conflicts,
    ...palette.conflicts,
    ...meta.conflicts,
  ];
  const previous = parseYtsheet(old.raw, old.url),
    current = fresh.sheet;
  const changes: string[] = [];
  if (old.generatorVersion !== GENERATOR_VERSION)
    changes.push("ツールの生成形式を更新します。手編集と重なる部分は、残す内容を選んでください。");
  for (const [label, a, b] of [
    ["CL", old.raw.level, raw.level],
    ...Object.keys(current.abilities).map((k) => [k, previous.abilities[k], current.abilities[k]]),
  ]) {
    if (String(a ?? "") !== String(b ?? "")) changes.push(`${label}：${a ?? "―"} → ${b ?? "―"}`);
  }
  const priorSkills = new Map(previous.skills.map((s) => [s.name, s]));
  for (const skill of current.skills) {
    const prior = priorSkills.get(skill.name);
    if (!prior) changes.push(`スキル追加：《${skill.name}》${skill.level}`);
    else if (skill.level !== prior.level)
      changes.push(`《${skill.name}》：SL ${prior.level} → ${skill.level}`);
    else if (JSON.stringify(skill) !== JSON.stringify(prior))
      changes.push(`《${skill.name}》：効果・コストなどの記載が変更されています。`);
  }
  for (const skill of previous.skills)
    if (!current.skills.some((s) => s.name === skill.name))
      changes.push(`スキル削除・改名：《${skill.name}》（手編集と重なる部分は確認してください）`);
  for (const [name, cells] of fresh.reset)
    changes.push(`${name}：更新後 ${cells[1]} / ${cells[2]}`);
  const next: Snapshot = {
    ...old,
    generatorVersion: GENERATOR_VERSION,
    name: current.name,
    raw,
    savedAt: new Date().toISOString(),
    calculation: fresh.calculation,
    base: fresh.fields,
    working: {
      statusEdit: status.text,
      paramsEdit: params.text,
      palette: palette.text,
      metadata: meta.text,
    },
  };
  return { next, fresh, conflicts, changes, warnings: fresh.warnings };
}
