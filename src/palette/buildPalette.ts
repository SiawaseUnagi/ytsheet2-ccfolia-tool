import { isEvasionCompanion } from "./checkPlacement";
import { planSkillPlacement } from "./skillPlacement";
import { skillToLines } from "./buildSkillCommands";
import { checkFormula, renderCheck, GENERAL_CHECKS } from "./checks";
import { textRow, serializeSections, type PaletteRow, type PaletteOutput } from "./document";
import { singleLineText } from "../utils/normalizeText";
import { normalizeEffect } from "../calculation/expression";
import { isBearUp } from "../calculation/attack";
import { readConsumableTable, consumableCommands } from "../items/tableConsumables";
import type { CustomCommandMap, ParsedSheet, YtSkill } from "../ytsheet/types";

const ORDER = [
  "リソース操作",
  "リアクション",
  "戦闘前",
  "セットアップ",
  "イニシアチブ",
  "フリー",
  "ムーブ",
  "レガシー",
  "マイナー",
  "メジャー",
  "判定の直前",
  "判定の直後",
  "DR直前",
  "DR直後",
  "クリンナップ",
  "戦闘不能",
  "効果参照",
  "判定",
  "プリプレイ",
  "パッシブ",
  "アイテム効果",
  "シーン終了時リセット",
  "シナリオ終了時リセット",
];
export function mapTiming(t: string): string {
  if (/パッシブ/.test(t)) return "パッシブ";
  for (const name of [
    "戦闘前",
    "セットアップ",
    "イニシアチブ",
    "フリー",
    "ムーブ",
    "レガシー",
    "マイナー",
    "メジャー",
  ])
    if (t.includes(name)) return name;
  if (/判定.*直前/.test(t)) return "判定の直前";
  if (/判定.*直後/.test(t)) return "判定の直後";
  if (/(?:ダメージロール|DR).*直前/.test(t)) return "DR直前";
  if (/(?:ダメージロール|DR).*直後/.test(t)) return "DR直後";
  for (const name of ["リアクション", "クリンナップ", "戦闘不能"])
    if (t.includes(name)) return name;
  return "効果参照";
}
const flat = (s: string) => s.replace(/\s+/g, " ").trim();
const preplaySkill = (s: YtSkill) =>
  /アイテム/.test(s.timing) || /^プリプレイで/.test(flat(s.effect));
const checkRow = (name: string, weaponCheck = false): PaletteRow => {
  const check = checkFormula(name)!;
  return { text: renderCheck(check), check, weaponCheck };
};
export function spiritReaction(sheet: ParsedSheet): string {
  const check = checkFormula(
    "精神",
    sheet.skills.some((s) => isBearUp(s.name) && s.level > 0) ? 1 : 0,
  )!;
  return renderCheck({ ...check, suffix: check.suffix + "（リアクション）" });
}
export function buildPalette(sheet: ParsedSheet, custom: CustomCommandMap): PaletteOutput {
  const sections = new Map<string, PaletteRow[]>(ORDER.map((name) => [name, []]));
  const append = (section: string, ...rows: PaletteRow[]) => sections.get(section)!.push(...rows);
  append(
    "リソース操作",
    ...[
      ":HP+",
      ":HP-",
      ":MP+",
      ":MP-",
      ":フェイト-",
      ":initiative=",
      "//ダメージ属性=物理",
      "//ダメージ属性=〈〉属性魔法",
      "",
      "2D　ドロップ品（）",
      "",
    ].map(textRow),
  );
  const spirit = checkFormula(
    "精神",
    sheet.skills.some((s) => isBearUp(s.name) && s.level > 0) ? 1 : 0,
  )!;
  spirit.suffix += "（リアクション）";
  spirit.judge = spirit.suffix;
  append(
    "リアクション",
    checkRow("回避"),
    { text: renderCheck(spirit), check: spirit },
    textRow("c(-{物理防御力}) 物理ダメージ計算"),
    textRow("c(-{魔法防御力}) 魔法ダメージ計算"),
    textRow(""),
  );
  append(
    "ムーブ",
    ...[
      "ムーブアクション放棄。",
      "ムーブアクションで戦闘移動を行なう。({移動力}m)",
      "ムーブアクションで全力移動を行なう。({移動力}+5m)",
      "ムーブアクションで離脱を行なう。",
    ].map(textRow),
  );
  append("マイナー", textRow("マイナーアクション放棄。"), textRow(""));
  const table = readConsumableTable(sheet.raw);
  // Consumable blocks are built directly at their section, not injected by reparsing output.
  for (const item of table.items)
    for (const timing of item.timings)
      append(timing, ...consumableCommands(item, timing).map(textRow), textRow(""));
  append(
    "メジャー",
    textRow("メジャーアクションで武器攻撃を行う。"),
    checkRow("命中", true),
    {
      text: "({攻撃ダイス}+{ダメBD})D+{攻撃力}+{ダメバフ} {ダメージ属性}ダメージ",
      weaponDamage: true,
    },
    textRow(""),
  );
  const placement = planSkillPlacement(sheet.skills),
    warnings = [...sheet.warnings, ...table.warnings, ...placement.warnings];
  const preplay: YtSkill[] = [],
    evade: PaletteRow[] = [];
  const addResets = (resets: ReturnType<typeof skillToLines>["resets"]) => {
    for (const r of resets) {
      const key = r.scope === "scene" ? "シーン終了時リセット" : "シナリオ終了時リセット";
      if (!sections.get(key)!.some((row) => row.text === r.line)) append(key, textRow(r.line));
    }
  };
  let emitted = 0;
  for (const root of placement.roots) {
    const isPreplay = preplaySkill(sheet.skills[root]);
    const target = isPreplay
      ? sections.get("プリプレイ")!
      : isEvasionCompanion(sheet.skills[root])
        ? evade
        : sections.get(mapTiming(sheet.skills[root].timing))!;
    const stack: { index: number; timing?: string; path: number[] }[] = [{ index: root, path: [] }];
    while (stack.length) {
      const entry = stack.pop()!,
        skill = sheet.skills[entry.index];
      if (entry.path.includes(entry.index) || ++emitted > 10000) {
        warnings.push(
          `《${skill.name}》：追加配置が循環するか多すぎるため、一部の配置を省きました。`,
        );
        break;
      }
      if (isPreplay && preplaySkill(skill)) preplay.push(skill);
      else {
        const timing = entry.timing ?? (isEvasionCompanion(skill) ? "回避判定と同時" : undefined);
        const effective = timing ? { ...skill, timing } : skill,
          out = skillToLines(effective, custom),
          passive = /パッシブ/.test(skill.timing);
        if (!out.usageLimit && /(シーン|シナリオ)[^。]*回/.test(normalizeEffect(skill.usage)))
          warnings.push(`《${skill.name}》：使用制限を読み取れませんでした。`);
        if (!passive && target.length && target[target.length - 1].text !== "")
          target.push(textRow(""));
        const origin = { index: entry.index, name: skill.name, level: skill.level };
        target.push(
          ...out.lines.map(
            (text, i): PaletteRow => ({
              text,
              skill: origin,
              declaration: i === 0,
              ...(i === out.checkIndex && out.check ? { check: out.check } : {}),
              effectsAfter: i === out.effectsAfter,
            }),
          ),
        );
        if (
          !passive ||
          mapTiming(skill.timing) !== "パッシブ" ||
          target !== sections.get("パッシブ")
        )
          target.push(textRow(""));
        addResets(out.resets);
      }
      const path = [...entry.path, entry.index];
      stack.push(
        ...[
          ...(placement.alternates.get(entry.index) ?? []).map((copy) => ({ ...copy, path })),
          ...(placement.children.get(entry.index) ?? []).map((index) => ({ index, path })),
        ].reverse(),
      );
    }
  }
  if (preplay.length)
    sections
      .get("プリプレイ")!
      .unshift(
        textRow(
          [
            "プリプレイ",
            ...preplay.map(
              (skill) => `《${skill.name}》${skill.level}：${flat(skill.effect) || "効果参照"}`,
            ),
          ].join("\\n"),
        ),
        textRow(""),
      );
  for (const [slot, caption] of [
    ["HandR", "右手"],
    ["HandL", "左手"],
    ["Head", "頭部"],
    ["Body", "胴部"],
    ["Sub", "補助防具"],
    ["Other", "装身具"],
  ]) {
    const name = singleLineText(sheet.raw[`armament${slot}Name`]),
      note = singleLineText(sheet.raw[`armament${slot}Note`]);
    if (name && note) append("アイテム効果", textRow(`${caption}：${name}。${note}`));
  }
  append("判定", ...GENERAL_CHECKS.map((name) => checkRow(name)));
  for (const section of ["リアクション", "判定"]) {
    const rows = sections.get(section)!,
      anchor = rows.findIndex((row) => row.check?.judge === "回避判定");
    if (anchor >= 0) rows.splice(anchor + 1, 0, ...evade.map((row) => ({ ...row })));
  }
  if (table.items.some((item) => item.label === "強心丹" && /シーン終了まで持続/.test(item.effect)))
    sections.get("シーン終了時リセット")!.unshift(textRow(":強心丹D=0"));
  return serializeSections(sections, warnings);
}
