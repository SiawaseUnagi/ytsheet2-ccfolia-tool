import { SheetGenerator } from "./output/generator";
import { mountMainView } from "./editor/view";
import { buildVariableText } from "./editor/variables";
import { ensureFlag } from "./resources/flags";
import { CORE_STATUS_LABELS } from "./resources/labels";
import { parseStatusText, parseParamsText, paramsToText } from "./editor/rows";
import {
  advanceCalculationBaseline,
  baselineNotice,
  GENERATOR_VERSION,
  combineCalculation,
  unmappedCalculation,
} from "./session/baseline";
import {
  checkFlagRename,
  replaceFlagReferences,
  replaceStatusLabel,
} from "./calculation/flagNames";
import { mountCalculationEditor } from "./calculation/ui";
import {
  emptyCalculationState,
  type CalculationEditor,
  type CalculationState,
} from "./calculation/sessionState";
import { fetchYtsheetJson } from "./ytsheet/fetchYtsheet";
import { characterJson, metadataOnly } from "./ccfolia/serialization";
import { fingerprint, type Fields, type Snapshot } from "./session/model";
import { switchParameterMode } from "./editor/parameterMode";

mountMainView();

let latest = "",
  latestVars = "",
  latestSkillNames: string[] = [];
let disposeCalculationEditor: CalculationEditor | undefined;
let activeSource:
  | {
      raw: Record<string, unknown>;
      url: string;
      useFormula: boolean;
      metadata: string;
      generator: SheetGenerator;
      parameterBase: string;
      urlKey: string;
      name: string;
      base: Fields;
      canonical: Fields;
      calculationKey: string;
      unmapped: CalculationState;
      generatorVersion?: string;
    }
  | undefined;
const BASE_STATUS_LABELS = CORE_STATUS_LABELS;
const area = (id: string) => document.getElementById(id) as HTMLTextAreaElement;
function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}
function isCurrentConsumableLabel(label: string): boolean {
  return activeSource?.generator.isConsumable(label) ?? false;
}
function ensureCorrectionFlag(requested: string): string {
  const input = area("statusEdit"),
    statuses = parseStatusText(input.value);
  const name = ensureFlag(
    statuses,
    parseParamsText(area("paramsEdit").value),
    requested,
    isCurrentConsumableLabel,
  );
  if (!parseStatusText(input.value).some((s) => s.label === name))
    input.value += `${input.value.trim() ? "\n" : ""}${name}\t0\t0`;
  return name;
}
function renameCorrectionFlag(previous: string, requested: string): string {
  const s = area("statusEdit"),
    p = area("paramsEdit"),
    palette = area("palette");
  const name = checkFlagRename(
    previous,
    requested,
    parseStatusText(s.value),
    parseParamsText(p.value),
    palette.value,
    (label) =>
      BASE_STATUS_LABELS.includes(label) ||
      label === "initiative" ||
      isCurrentConsumableLabel(label),
  );
  s.value = replaceStatusLabel(s.value, previous, name);
  p.value = replaceFlagReferences(p.value, previous, name);
  palette.value = replaceFlagReferences(palette.value, previous, name);
  return name;
}
function refreshVariableHelpers(): void {
  latestVars = buildVariableText(
    parseStatusText(area("statusEdit").value),
    parseParamsText(area("paramsEdit").value),
    latestSkillNames,
    isCurrentConsumableLabel,
  );
  area("vars").value = latestVars;
}
function calculationChanged(): void {
  if (activeSource && disposeCalculationEditor) {
    const state = currentCalculation(),
      key = JSON.stringify(state);
    if (key !== activeSource.calculationKey) {
      const next = activeSource.generator.render(activeSource.useFormula, state);
      activeSource.base = advanceCalculationBaseline(
        activeSource.base,
        activeSource.canonical,
        next.fields,
      );
      activeSource.canonical = next.fields;
      activeSource.calculationKey = key;
    }
  }
  refreshVariableHelpers();
}
async function loadRawSheet(): Promise<Record<string, unknown>> {
  const manual = area("json").value.trim();
  if (manual) return JSON.parse(manual) as Record<string, unknown>;
  const url = (document.getElementById("url") as HTMLInputElement).value.trim();
  if (!url) throw new Error("ゆとシートURLを入力してください。");
  return (await fetchYtsheetJson(url)) as Record<string, unknown>;
}
function refreshOutputJsonFromEditedFields(): string {
  const out = area("outjson").value.trim() || latest;
  if (!out) throw new Error("先に出力してください。");
  latest = characterJson({
    statusEdit: area("statusEdit").value,
    paramsEdit: area("paramsEdit").value,
    palette: area("palette").value,
    metadata: metadataOnly(out),
  });
  area("outjson").value = latest;
  refreshVariableHelpers();
  document.getElementById("warn")!.textContent = "編集内容をココフォリアJSONに反映しました。";
  return latest;
}

function currentCalculation(): CalculationState {
  return combineCalculation(
    disposeCalculationEditor?.getState() ?? emptyCalculationState(),
    activeSource?.unmapped ?? emptyCalculationState(),
  );
}
function workingFields(): Fields {
  return {
    statusEdit: area("statusEdit").value,
    paramsEdit: area("paramsEdit").value,
    palette: area("palette").value,
    metadata: metadataOnly(area("outjson").value || latest),
  };
}
export const sessionBridge = {
  currentFingerprint(): string | null {
    if (!activeSource || !latest) return null;
    return fingerprint({
      key: activeSource.urlKey,
      useFormula: activeSource.useFormula,
      working: workingFields(),
      calculation: currentCalculation(),
    });
  },
  capture(): Snapshot {
    if (!activeSource || !latest) throw new Error("先にキャラシを出力してください。");
    const calculation = currentCalculation();
    const base = activeSource.base;
    const working = workingFields();
    return {
      key: activeSource.urlKey,
      name: activeSource.name,
      raw: structuredClone(activeSource.raw),
      url: activeSource.url,
      useFormula: activeSource.useFormula,
      savedAt: new Date().toISOString(),
      generatorVersion: activeSource.generatorVersion,
      calculation: structuredClone(calculation),
      base: structuredClone(base),
      working,
    };
  },
  restore(snapshot: Snapshot): void {
    // Prepare everything before changing the editor. Loading alone never refills resources.
    const generator = new SheetGenerator(snapshot.raw, snapshot.url);
    const base = generator.render(snapshot.useFormula, snapshot.calculation);
    const json = characterJson(snapshot.working);
    disposeCalculationEditor?.();
    activeSource = {
      generator,
      raw: structuredClone(snapshot.raw),
      url: snapshot.url,
      useFormula: snapshot.useFormula,
      metadata: snapshot.base.metadata,
      parameterBase: snapshot.base.paramsEdit,
      urlKey: snapshot.key,
      name: snapshot.name,
      base: structuredClone(snapshot.base),
      canonical: base.fields,
      calculationKey: JSON.stringify(snapshot.calculation),
      unmapped: unmappedCalculation(snapshot.calculation, base.calculation),
      generatorVersion: snapshot.generatorVersion,
    };
    latest = json;
    latestSkillNames = unique(base.sheet.skills.map((s) => s.name));
    (document.getElementById("url") as HTMLInputElement).value = snapshot.url;
    area("json").value = "";
    (document.getElementById("useYtsheetStyleParams") as HTMLInputElement).checked =
      snapshot.useFormula;
    area("statusEdit").value = snapshot.working.statusEdit;
    area("paramsEdit").value = snapshot.working.paramsEdit;
    area("palette").value = snapshot.working.palette;
    area("outjson").value = json;
    refreshVariableHelpers();
    disposeCalculationEditor = mountCalculationEditor(
      document.getElementById("calculationEditor")!,
      base.prepared,
      area("palette"),
      {
        ensureFlag: ensureCorrectionFlag,
        renameFlag: renameCorrectionFlag,
        changed: calculationChanged,
      },
      snapshot.calculation,
    );
    document.getElementById("warn")!.textContent =
      [...base.warnings, ...baselineNotice(snapshot.generatorVersion)].join("\n") ||
      "保存内容を復元しました。";
  },
};

(document.getElementById("useYtsheetStyleParams") as HTMLInputElement).onchange = () => {
  const option = document.getElementById("useYtsheetStyleParams") as HTMLInputElement;
  if (!activeSource || option.checked === activeSource.useFormula) return;
  const previous = activeSource.useFormula,
    warn = document.getElementById("warn")!;
  if ((document.getElementById("gen") as HTMLButtonElement).disabled) {
    option.checked = previous;
    warn.textContent = "読み込み中です。完了後に変数の設定を切り替えてください。";
    return;
  }
  try {
    const plan = switchParameterMode(
      area("paramsEdit").value,
      activeSource.parameterBase,
      activeSource.generator.formula,
      activeSource.generator.fixed,
      option.checked,
    );
    // Validate and serialize before committing any changes to the visible editor.
    const json = characterJson({
      statusEdit: area("statusEdit").value,
      paramsEdit: plan.text,
      palette: area("palette").value,
      metadata: metadataOnly(area("outjson").value || latest),
    });
    area("paramsEdit").value = plan.text;
    area("outjson").value = json;
    latest = json;
    activeSource.useFormula = option.checked;
    activeSource.parameterBase = plan.baseline;
    activeSource.base.paramsEdit = plan.baseline;
    activeSource.canonical.paramsEdit = paramsToText(
      option.checked ? activeSource.generator.formula : activeSource.generator.fixed,
    );
    refreshVariableHelpers();
    area("paramsEdit").dispatchEvent(new Event("input", { bubbles: true }));
    warn.textContent = `パラメータを${option.checked ? "参照式" : "固定値"}に切り替えました。チャットパレットと補正の選択は保持しています。`;
    if (plan.retained.length)
      warn.textContent += `\n手編集した項目や数値を確定できない項目は、そのまま残しました：${plan.retained.join("、")}`;
  } catch (error) {
    option.checked = previous;
    warn.textContent = `切り替えを中止しました：${error instanceof Error ? error.message : String(error)}`;
  }
};

(document.getElementById("gen") as HTMLButtonElement).onclick = async () => {
  const warn = document.getElementById("warn")!;
  if (
    latest &&
    !window.confirm("再出力すると、手で編集した内容と補正の選択をリセットします。再出力しますか？")
  )
    return;
  const button = document.getElementById("gen") as HTMLButtonElement;
  button.disabled = true;
  warn.textContent = "出力中...";
  try {
    const before = JSON.stringify([
      area("statusEdit").value,
      area("paramsEdit").value,
      area("palette").value,
      area("outjson").value,
      currentCalculation(),
    ]);
    const raw = await loadRawSheet();
    if (
      before !==
      JSON.stringify([
        area("statusEdit").value,
        area("paramsEdit").value,
        area("palette").value,
        area("outjson").value,
        currentCalculation(),
      ])
    ) {
      throw new Error("読み込み中に編集が変わったため、内容を保護して再出力を中止しました。");
    }
    const url =
      (document.getElementById("url") as HTMLInputElement).value.trim() ||
      String(raw.sheetURL ?? "");
    const useFormula = (document.getElementById("useYtsheetStyleParams") as HTMLInputElement)
      .checked;
    const generator = new SheetGenerator(raw, url),
      generated = generator.newOutput(useFormula);
    const { sheet, fields, prepared, calculation } = generated;
    const json = characterJson(fields);
    // Build and validate the complete result before replacing the existing editor.
    disposeCalculationEditor?.();
    latest = json;
    latestSkillNames = unique(sheet.skills.map((s) => s.name));
    activeSource = {
      generator,
      raw: generator.raw,
      url,
      useFormula,
      metadata: fields.metadata,
      parameterBase: fields.paramsEdit,
      urlKey: generated.key,
      name: sheet.name,
      base: structuredClone(fields),
      canonical: fields,
      calculationKey: JSON.stringify(calculation),
      unmapped: emptyCalculationState(),
      generatorVersion: GENERATOR_VERSION,
    };
    area("outjson").value = json;
    area("statusEdit").value = fields.statusEdit;
    area("paramsEdit").value = fields.paramsEdit;
    area("palette").value = fields.palette;
    disposeCalculationEditor = mountCalculationEditor(
      document.getElementById("calculationEditor")!,
      prepared,
      area("palette"),
      {
        ensureFlag: ensureCorrectionFlag,
        renameFlag: renameCorrectionFlag,
        changed: calculationChanged,
      },
      calculation,
    );
    activeSource.calculationKey = JSON.stringify(disposeCalculationEditor.getState());
    refreshVariableHelpers();
    const warnings = [...generated.warnings];
    if (prepared.reviews.length)
      warnings.push(
        `自動で式にできない効果が${prepared.reviews.length}件あります。「式に加える補正」の要確認欄を確認してください。`,
      );
    warn.textContent = warnings.join("\n") || "OK";
    document.dispatchEvent(new Event("ytsheet:generated"));
  } catch (error) {
    warn.textContent = `出力失敗: ${String(error)}`;
  } finally {
    button.disabled = false;
  }
};
(document.getElementById("copy") as HTMLButtonElement).onclick = async () => {
  try {
    await navigator.clipboard.writeText(refreshOutputJsonFromEditedFields());
  } catch (error) {
    document.getElementById("warn")!.textContent = `コピー失敗: ${String(error)}`;
  }
};
(document.getElementById("copyVars") as HTMLButtonElement).onclick = async () => {
  refreshVariableHelpers();
  await navigator.clipboard.writeText(latestVars);
};
