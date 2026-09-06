import { buildCharacterJson } from "../ccfolia/buildCharacterJson";
import { buildMemo } from "../ccfolia/buildMemo";
import { buildParams } from "../ccfolia/buildParams";
import { buildStatus } from "../ccfolia/buildStatus";
import { isKnownConsumableLabel } from "../items/consumables";
import { buildPalette } from "../palette/buildPalette";
import { detectUsageLimit } from "../palette/detectUsageLimit";
import { parseYtsheet } from "../ytsheet/parseYtsheet";
import { prepareCalculationPalette } from "../calculation/palette";
import { replaceFlagReferences } from "../calculation/flagNames";
import { applyCalculationState, emptyCalculationState, modifierKey, targetKey, selectionsFor, type CalculationState } from "../calculation/sessionState";
import { assertSheetIdentity, type Fields, type Snapshot } from "./model";
import { mergeText, mergeRows, mergeMetadata, splitRow, type Choices, type Conflict } from "./merge";

export function metadataOnly(json: string): string {
  const parsed = JSON.parse(json);
  if (parsed?.kind !== "character" || !parsed.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) throw new Error("ココフォリアJSONの形式を確認してください。");
  const { status: _status, params: _params, commands: _commands, ...data } = parsed.data;
  return JSON.stringify({ ...parsed, data });
}
export function characterJson(fields: Fields): string {
  const meta = JSON.parse(fields.metadata);
  const parse = (text: string, status: boolean) => text.split("\n").filter(l => l.trim()).map(l => {
    const [label, value = "0", max = "0"] = splitRow(l);
    return status ? { label, value, max } : { label, value };
  });
  return JSON.stringify({ ...meta, data: { ...meta.data, status: parse(fields.statusEdit, true), params: parse(fields.paramsEdit, false), commands: fields.palette } }, null, 2);
}
const numericFlags = ["判定BD", "命中BD", "回避BD", "ダメBD", "ダメバフ"];
const reservedFlags = ["HP", "MP", "フェイト", "移動力", "物理防御力", "魔法防御力", "携帯可能重量", "EP", "所持金", "initiative", ...numericFlags];

export function generateSessionBase(raw: Record<string, unknown>, url: string, useFormula: boolean, state = emptyCalculationState()) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error("キャラシのデータ形式を確認できません。");
  for (const [label, keys] of [["HP", ["hpTotal", "maxHp", "hp"]], ["MP", ["mpTotal", "maxMp", "mp"]], ["フェイト", ["fateTotal", "fate", "フェイト"]], ["CL", ["level", "CL", "cl"]]] as const) {
    const value = keys.map(k => raw[k]).find(v => v !== undefined && v !== null && String(v).trim() !== "");
    if (value === undefined || !Number.isFinite(Number(value)) || Number(value) < 0) throw new Error(`${label}の値を読み取れません。0で上書きせず更新を止めました。`);
  }
  if (!String(raw.characterName ?? raw.pcName ?? "").trim() || (!Array.isArray(raw.skill) && raw.skillNum === undefined)) throw new Error("キャラ名またはスキル一覧を確認できないため、更新を止めました。");
  const key = assertSheetIdentity(raw, url), sheet = parseYtsheet(raw, url), status = buildStatus(sheet, {}), params = buildParams(sheet, useFormula);
  let palette = buildPalette(sheet, {}).text;
  const initial = prepareCalculationPalette(sheet, palette);
  const targetKeys = new Set(initial.targets.map(targetKey)), modifierKeys = new Set(initial.modifiers.map(m => modifierKey(m, initial.modifiers)));
  const allowedFlagKeys = new Set(initial.modifiers.map(m => m.flag));
  const calculation: CalculationState = { version: 1,
    choices: state.choices.filter(c => targetKeys.has(c.target) && modifierKeys.has(c.modifier)),
    flags: state.flags.filter(f => allowedFlagKeys.has(f.key)).map(f => ({ ...f })),
  };
  const warnings = state.choices.filter(c => c.checked && !calculation.choices.includes(c)).map(() => "前回選んだ補正の一部は、スキルの削除・改名・効果変更などで対応が確定しないため、再選択が必要です。");
  for (const binding of calculation.flags) {
    const name = binding.actual ?? binding.name;
    const row = status.find(s => s.label === binding.key);
    if (row && Number(row.max) === 0 && binding.key !== name) {
      if (status.some(s => s.label === name) || params.some(p => p.label === name)) throw new Error(`短縮名「${name}」が新しい項目と重複しています。更新前に補正用の名前を変更してください。`);
      row.label = name; palette = replaceFlagReferences(palette, binding.key, name);
    }
  }
  const prepared = applyCalculationState(prepareCalculationPalette(sheet, palette), calculation);
  const selectedFlags = prepared.targets.flatMap(t => selectionsFor(prepared, t, calculation)).flatMap(s => s.flag ? [s.flag] : []);
  const flagLabels = new Set([...selectedFlags, ...calculation.flags.filter(f => f.actual).map(f => f.actual!)]);
  for (const name of flagLabels) {
    const existing = status.find(s => s.label === name);
    if (reservedFlags.includes(name) || isKnownConsumableLabel(name) || params.some(p => p.label === name) || (existing && Number(existing.max) !== 0)) {
      throw new Error(`補正名「${name}」が回数・能力値などと重なります。更新前に補正名を変更してください。`);
    }
    if (!existing) status.push({ label: name, value: "0", max: "0" });
  }
  // Keep the currently configured character colour without reinterpreting it during save/resume.
  const cc = buildCharacterJson(sheet.name, url, status, params, prepared.text, sheet.initiative, buildMemo(raw));
  const fields: Fields = {
    statusEdit: status.map(s => [s.label, s.value, s.max].join("\t")).join("\n"),
    paramsEdit: params.map(p => [p.label, p.value].join("\t")).join("\n"),
    palette: prepared.text, metadata: metadataOnly(JSON.stringify(cc)),
  };
  const reset = new Map<string, string[]>();
  const limitNames = new Set(sheet.skills.filter(s => detectUsageLimit(s)).map(s => s.name));
  const toggles = new Set(sheet.skills.filter(s => /シーン終了まで持続|メインプロセス終了まで持続|ラウンド終了まで持続|影響がある場所にいる間|効果を受ける場所/.test(`${s.timing} ${s.effect}`)).map(s => s.name));
  for (const s of status) {
    if (["HP", "MP", "フェイト"].includes(s.label) || limitNames.has(s.label)) reset.set(s.label, [s.label, s.max, s.max]);
    else if (toggles.has(s.label) || flagLabels.has(s.label) || numericFlags.includes(s.label)) reset.set(s.label, [s.label, "0", s.max]);
    else if (isKnownConsumableLabel(s.label) || s.label === "EP") reset.set(s.label, [s.label, s.value, s.max]);
  }
  return { key, sheet, prepared, calculation, fields, reset, warnings: [...new Set(warnings)] };
}

export function planSessionUpdate(old: Snapshot, raw: Record<string, unknown>, choices: Choices = {}) {
  if (assertSheetIdentity(raw, old.url) !== old.key) throw new Error("別のキャラクターへの上書きは行いません。");
  const fresh = generateSessionBase(raw, old.url, old.useFormula, old.calculation);
  // Colour is handled by the main editor. Retain it unless separately edited by the user.
  const baselineMeta = JSON.parse(old.base.metadata), newMeta = JSON.parse(fresh.fields.metadata);
  if (baselineMeta.data?.color !== undefined) newMeta.data.color = baselineMeta.data.color;
  fresh.fields.metadata = JSON.stringify(newMeta);
  const status = mergeRows(old.base.statusEdit, old.working.statusEdit, fresh.fields.statusEdit, "ステータス", 3, fresh.reset, choices);
  const params = mergeRows(old.base.paramsEdit, old.working.paramsEdit, fresh.fields.paramsEdit, "パラメータ", 2, new Map(), choices);
  const palette = mergeText(old.base.palette, old.working.palette, fresh.fields.palette, "チャットパレット", choices);
  const meta = mergeMetadata(old.base.metadata, old.working.metadata, fresh.fields.metadata, choices);
  const conflicts: Conflict[] = [...status.conflicts, ...params.conflicts, ...palette.conflicts, ...meta.conflicts];
  const previous = parseYtsheet(old.raw, old.url), current = fresh.sheet;
  const changes: string[] = [];
  for (const [label, a, b] of [["CL",old.raw.level,raw.level], ...Object.keys(current.abilities).map(k => [k,previous.abilities[k],current.abilities[k]])]) {
    if (String(a ?? "") !== String(b ?? "")) changes.push(`${label}：${a ?? "―"} → ${b ?? "―"}`);
  }
  const priorSkills = new Map(previous.skills.map(s => [s.name,s]));
  for (const skill of current.skills) {
    const prior = priorSkills.get(skill.name);
    if (!prior) changes.push(`スキル追加：《${skill.name}》${skill.level}`);
    else if (skill.level !== prior.level) changes.push(`《${skill.name}》：SL ${prior.level} → ${skill.level}`);
    else if (JSON.stringify(skill) !== JSON.stringify(prior)) changes.push(`《${skill.name}》：効果・コストなどの記載が変更されています。`);
  }
  for (const skill of previous.skills) if (!current.skills.some(s => s.name === skill.name)) changes.push(`スキル削除・改名：《${skill.name}》（手編集と重なる部分は確認してください）`);
  for (const [name, cells] of fresh.reset) changes.push(`${name}：更新後 ${cells[1]} / ${cells[2]}`);
  const next: Snapshot = { ...old, name: current.name, raw, savedAt: new Date().toISOString(), calculation: fresh.calculation,
    base: fresh.fields, working: { statusEdit: status.text, paramsEdit: params.text, palette: palette.text, metadata: meta.text } };
  return { next, fresh, conflicts, changes, warnings: fresh.warnings };
}
