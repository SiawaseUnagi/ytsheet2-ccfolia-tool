import { buildCharacterJson } from "../ccfolia/buildCharacterJson";
import { buildMemo } from "../ccfolia/buildMemo";
import { buildParams } from "../ccfolia/buildParams";
import { extractColor } from "../ccfolia/color";
import { metadataOnly } from "../ccfolia/serialization";
import { statusToText, paramsToText } from "../editor/rows";
import { buildPalette } from "./enhancements";
import { parseYtsheet } from "../ytsheet/parseYtsheet";
import { prepareCalculationPalette, TrackedPalette } from "../calculation/palette";
import { createDefaultCalculationState } from "../calculation/defaults";
import {
  applyCalculationState,
  emptyCalculationState,
  modifierKey,
  targetKey,
  selectionsFor,
  type CalculationState,
} from "../calculation/sessionState";
import { assertSheetIdentity, type Fields } from "../session/model";
import { numericValue } from "../utils/safeNumber";
import { buildStatusPlan, statusRows } from "../resources/statusPlan";
import { RESERVED_FLAG_LABELS } from "../resources/labels";
import { ensureFlag } from "../resources/flags";

export function validateSheet(raw: Record<string, unknown>): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw new Error("キャラシのデータ形式を確認できません。");
  for (const [label, keys] of [
    ["HP", ["hpTotal", "maxHp", "hp"]],
    ["MP", ["mpTotal", "maxMp", "mp"]],
    ["フェイト", ["fateTotal", "fate", "フェイト"]],
    ["CL", ["level", "CL", "cl"]],
  ] as const) {
    const value = keys
      .map((k) => raw[k])
      .find((v) => v !== undefined && v !== null && String(v).trim() !== "");
    if (numericValue(value) === undefined || numericValue(value)! < 0)
      throw new Error(`${label}の値を読み取れません。0で上書きせず処理を止めました。`);
  }
  if (
    !String(raw.characterName ?? raw.pcName ?? "").trim() ||
    (!Array.isArray(raw.skill) && raw.skillNum === undefined)
  )
    throw new Error("キャラ名またはスキル一覧を確認できません。");
  for (const key of ["skillNum", "unitStatusNum"])
    if (raw[key] !== undefined) {
      const value = numericValue(raw[key]);
      if (value === undefined || !Number.isInteger(value) || value < 0 || value > 3000)
        throw new Error(`${key}の件数を確認できません。`);
    }
  if (Array.isArray(raw.skill) && raw.skill.length > 3000)
    throw new Error("スキルの件数が多すぎます。");
}

/** A context owns an immutable source copy. Parse/analyse once, render selected
 * corrections repeatedly without refetching or reinterpreting the source. */
export class SheetGenerator {
  readonly raw: Record<string, unknown>;
  readonly key: string;
  readonly sheet;
  readonly prepared;
  readonly resourcePlan;
  readonly formula;
  readonly fixed;
  readonly warnings;
  private readonly targetKeys: Set<string>;
  private readonly modifierKeys: Set<string>;
  private readonly flagKeys: Set<string>;
  private readonly consumableLabels: Set<string>;
  constructor(
    raw: Record<string, unknown>,
    readonly url: string,
  ) {
    validateSheet(raw);
    this.key = assertSheetIdentity(raw, url);
    this.raw = structuredClone(raw);
    this.sheet = parseYtsheet(this.raw, url);
    this.resourcePlan = buildStatusPlan(this.sheet);
    this.formula = buildParams(this.sheet, true);
    this.fixed = buildParams(this.sheet, false);
    const generated = buildPalette(this.sheet, {});
    this.prepared = prepareCalculationPalette(this.sheet, generated);
    this.warnings = generated.warnings;
    this.targetKeys = new Set(this.prepared.targets.map(targetKey));
    this.modifierKeys = new Set(
      this.prepared.modifiers.map((m) => modifierKey(m, this.prepared.modifiers)),
    );
    this.flagKeys = new Set(this.prepared.modifiers.map((m) => m.flag));
    this.consumableLabels = new Set(
      this.resourcePlan.filter((r) => r.kind === "consumable").map((r) => r.label),
    );
  }
  isConsumable(label: string): boolean {
    return this.consumableLabels.has(label);
  }
  newOutput(useFormula: boolean) {
    const status = statusRows(this.resourcePlan),
      params = useFormula ? this.formula : this.fixed;
    const state = createDefaultCalculationState(this.prepared, (name) =>
      ensureFlag(status, params, name, (label) => this.isConsumable(label)),
    );
    return this.render(useFormula, state);
  }
  render(useFormula: boolean, state = emptyCalculationState()) {
    const status = statusRows(this.resourcePlan),
      params = useFormula ? this.formula : this.fixed;
    const calculation: CalculationState = {
      version: 1,
      choices: state.choices.filter(
        (c) => this.targetKeys.has(c.target) && this.modifierKeys.has(c.modifier),
      ),
      flags: state.flags.filter((f) => this.flagKeys.has(f.key)).map((f) => ({ ...f })),
    };
    const warnings = [...this.warnings];
    if (state.choices.some((c) => c.checked && !calculation.choices.includes(c)))
      warnings.push(
        "前回選んだ補正の一部は、スキルの削除・改名・効果変更などで対応が確定しないため、再選択が必要です。",
      );
    const selected = applyCalculationState(this.prepared, calculation),
      tracker = new TrackedPalette(selected.text, selected.ranges);
    for (const binding of calculation.flags) {
      const name = binding.actual ?? binding.name,
        row = status.find((s) => s.label === binding.key);
      if (row && row.max === "0" && binding.key !== name) {
        if (status.some((s) => s.label === name) || params.some((p) => p.label === name))
          throw new Error(
            `短縮名「${name}」が新しい項目と重複しています。補正用の名前を変更してください。`,
          );
        row.label = name;
        tracker.renameFlag(binding.key, name);
      }
    }
    const prepared = { ...selected, text: tracker.text, ranges: tracker.ranges };
    const flags = new Set([
      ...prepared.targets
        .flatMap((t) => selectionsFor(prepared, t, calculation))
        .flatMap((s) => (s.flag ? [s.flag] : [])),
      ...calculation.flags.flatMap((f) => (f.actual ? [f.actual] : [])),
    ]);
    for (const name of flags) {
      const existing = status.find((s) => s.label === name);
      if (
        RESERVED_FLAG_LABELS.has(name) ||
        this.isConsumable(name) ||
        params.some((p) => p.label === name) ||
        (existing && existing.max !== "0")
      )
        throw new Error(
          `補正名「${name}」が回数・能力値などと重なります。補正名を変更してください。`,
        );
      if (!existing) status.push({ label: name, value: "0", max: "0" });
    }
    const cc = buildCharacterJson(
      this.sheet.name,
      this.url,
      status,
      params,
      prepared.text,
      this.sheet.initiative,
      buildMemo(this.raw),
      extractColor(this.raw),
    );
    const fields: Fields = {
      statusEdit: statusToText(status),
      paramsEdit: paramsToText(params),
      palette: prepared.text,
      metadata: metadataOnly(JSON.stringify(cc)),
    };
    const reset = new Map<string, string[]>();
    for (const resource of this.resourcePlan) {
      const binding = calculation.flags.find((f) => f.key === resource.label),
        label =
          resource.kind === "flag"
            ? (binding?.actual ?? binding?.name ?? resource.label)
            : resource.label;
      const row = status.find((s) => s.label === label);
      if (!row) continue;
      if (resource.reset === "maximum") reset.set(label, [label, row.max, row.max]);
      else if (resource.reset === "zero") reset.set(label, [label, "0", row.max]);
      else if (resource.reset === "source") reset.set(label, [label, row.value, row.max]);
    }
    for (const name of flags) reset.set(name, [name, "0", "0"]);
    return {
      key: this.key,
      sheet: this.sheet,
      prepared,
      calculation,
      fields,
      reset,
      warnings: [...new Set(warnings)],
    };
  }
}
export const generateSessionBase = (
  raw: Record<string, unknown>,
  url: string,
  useFormula: boolean,
  state = emptyCalculationState(),
) => new SheetGenerator(raw, url).render(useFormula, state);
