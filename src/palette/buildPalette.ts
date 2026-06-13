import { DEFAULT_CONSUMABLES } from "../items/consumables";
import type { CustomCommandMap, ParsedSheet, YtSkill } from "../ytsheet/types";
import { skillToLines } from "./buildSkillCommands";

function sec() {
  return new Map<string, string[]>([
    ["リソース操作", [":HP+", ":HP-", ":MP+", ":MP-", ":フェイト-", "", "2D　ドロップ品（）", "", "{回避D}D+{回避判定}+{回避判定修正}+{判定BD}D+{回避BD}D>=0 回避判定", "c(-{物理防御力}) 物理ダメージ計算", "c(-{魔法防御力}) 魔法ダメージ計算"]],
    ["戦闘前", []],
    ["セットアップ", []],
    ["イニシアチブ", []],
    ["フリー", []],
    ["ムーブ", ["ムーブアクション放棄。", "ムーブアクションで戦闘移動を行なう。({移動力}m)", "ムーブアクションで全力移動を行なう。({移動力}+5m)", "ムーブアクションで離脱を行なう。"]],
    ["レガシー", []],
    ["マイナー", ["マイナーアクション放棄。"]],
    ["メジャー", []],
    ["判定の直前", []],
    ["判定の直後", []],
    ["DR直前", []],
    ["DR直後", []],
    ["リアクション", []],
    ["クリンナップ", []],
    ["戦闘不能", []],
    ["効果参照", []],
    ["アイテム", []],
    ["装備効果", []],
    ["シーン終了時リセット", []],
    ["シナリオ開始時リセット", []],
    ["判定", []],
    ["パッシブ", []],
  ]);
}

function mapTiming(t: string): string {
  if (/パッシブ/.test(t)) return "パッシブ";
  if (/戦闘前/.test(t)) return "戦闘前";
  if (/セットアップ/.test(t)) return "セットアップ";
  if (/イニシアチブ/.test(t)) return "イニシアチブ";
  if (/フリー/.test(t)) return "フリー";
  if (/ムーブ/.test(t)) return "ムーブ";
  if (/レガシー/.test(t)) return "レガシー";
  if (/マイナー/.test(t)) return "マイナー";
  if (/メジャー/.test(t)) return "メジャー";
  if (/判定.*直前/.test(t)) return "判定の直前";
  if (/判定.*直後/.test(t)) return "判定の直後";
  if (/ダメージロール.*直前|DRの直前|DR直前/.test(t)) return "DR直前";
  if (/ダメージロール.*直後|DRの直後|DR直後/.test(t)) return "DR直後";
  if (/リアクション/.test(t)) return "リアクション";
  if (/クリンナップ/.test(t)) return "クリンナップ";
  if (/戦闘不能/.test(t)) return "戦闘不能";
  if (/アイテム/.test(t)) return "アイテム";
  if (/効果参照/.test(t)) return "効果参照";
  return "効果参照";
}

function referencedSkillName(timing: string): string | null {
  return timing.trim().match(/^《(.+)》$/)?.[1] ?? null;
}

function looksLikeUnreadLimitedUse(usage: string): boolean {
  return /(シーン|シナリオ)\s*(?:\d+|SL(?:\s*[＋+]\s*\d+)?)\s*回/.test(usage);
}

function cleanHtml(text: unknown): string {
  return String(text ?? "").replace(/&lt;br&gt;/g, " ").replace(/<br\s*\/?>/g, " ").replace(/\s+/g, " ").trim();
}

function collectEquipmentNotes(sheet: ParsedSheet): string[] {
  const raw = sheet.raw;
  const slots = [
    ["右手", "armamentHandRName", "armamentHandRNote"],
    ["左手", "armamentHandLName", "armamentHandLNote"],
    ["頭部", "armamentHeadName", "armamentHeadNote"],
    ["胴部", "armamentBodyName", "armamentBodyNote"],
    ["補助防具", "armamentSubName", "armamentSubNote"],
    ["装身具", "armamentOtherName", "armamentOtherNote"],
  ];
  const lines: string[] = [];
  for (const [slot, nameKey, noteKey] of slots) {
    const name = cleanHtml(raw[nameKey]);
    const note = cleanHtml(raw[noteKey]);
    if (name && note) lines.push(`${slot}：${name}。${note}`);
  }
  return lines;
}

function weaponAttackLines(): string[] {
  return [
    "メジャーアクションで武器攻撃を行う。",
    "{命中D}D+{命中判定}+{命中判定修正}+{判定BD}D+{命中BD}D>=0 命中判定",
    "{攻撃力D}D+{攻撃力}+{ダメBD}D+{ダメバフ} 物理ダメージ",
  ];
}

function defaultConsumableLines(): string[] {
  return DEFAULT_CONSUMABLES.flatMap((item) => [
    `マイナーアクションで${item.label}を使用。`,
    `:${item.label}-1`,
    "",
  ]);
}

function pushSkillLines(map: Map<string, string[]>, target: string, lines: string[]) {
  if (target === "パッシブ") map.get(target)?.push(...lines);
  else map.get(target)?.push(...lines, "");
}

type SkillOutput = {
  skill: YtSkill;
  target: string;
  lines: string[];
  resets: { scope: "scene" | "scenario"; line: string }[];
  usageLimit: unknown;
};

function pushResets(map: Map<string, string[]>, resets: SkillOutput["resets"]) {
  for (const r of resets) map.get(r.scope === "scene" ? "シーン終了時リセット" : "シナリオ開始時リセット")?.push(r.line);
}

export function buildPalette(sheet: ParsedSheet, custom: CustomCommandMap): { text: string; warnings: string[] } {
  const s = sec();
  const warnings = [...sheet.warnings];
  s.get("マイナー")?.push(...defaultConsumableLines());
  s.get("メジャー")?.push(...weaponAttackLines());

  const dependent = new Map<string, SkillOutput[]>();
  const independent: SkillOutput[] = [];

  for (const sk of sheet.skills) {
    const refName = referencedSkillName(sk.timing);
    const target = refName ? "効果参照" : mapTiming(sk.timing);
    const out = skillToLines(sk, custom);
    const item: SkillOutput = { skill: sk, target, lines: out.lines, resets: out.resets, usageLimit: out.usageLimit };
    if (refName) {
      const list = dependent.get(refName) ?? [];
      list.push(item);
      dependent.set(refName, list);
    } else {
      independent.push(item);
    }
    if (!out.usageLimit && looksLikeUnreadLimitedUse(sk.usage)) warnings.push(`《${sk.name}》：使用制限を読み取れませんでした。`);
  }

  for (const item of independent) {
    pushSkillLines(s, item.target, item.lines);
    pushResets(s, item.resets);
    const children = dependent.get(item.skill.name) ?? [];
    for (const child of children) {
      pushSkillLines(s, item.target, child.lines);
      pushResets(s, child.resets);
    }
    dependent.delete(item.skill.name);
  }

  for (const children of dependent.values()) {
    for (const child of children) {
      pushSkillLines(s, "効果参照", child.lines);
      pushResets(s, child.resets);
    }
  }

  s.get("装備効果")?.push(...collectEquipmentNotes(sheet));
  s.get("判定")?.push(
    "{筋力D}D+{筋力}+{筋力判定修正}+{判定BD}D>=0 【筋力】判定",
    "{器用D}D+{器用}+{器用判定修正}+{判定BD}D>=0 【器用】判定",
    "{敏捷D}D+{敏捷}+{敏捷判定修正}+{判定BD}D>=0 【敏捷】判定",
    "{知力D}D+{知力}+{知力判定修正}+{判定BD}D>=0 【知力】判定",
    "{感知D}D+{感知}+{感知判定修正}+{判定BD}D>=0 【感知】判定",
    "{精神D}D+{精神}+{精神判定修正}+{判定BD}D>=0 【精神】判定",
    "{幸運D}D+{幸運}+{幸運判定修正}+{判定BD}D>=0 【幸運】判定",
    "{命中D}D+{命中判定}+{命中判定修正}+{判定BD}D+{命中BD}D>=0 命中判定",
    "{回避D}D+{回避判定}+{回避判定修正}+{判定BD}D+{回避BD}D>=0 回避判定",
    "2D+{感知}+{トラップ探知修正}+{判定BD}D>=0 トラップ探知判定",
    "2D+{器用}+{トラップ解除修正}+{判定BD}D>=0 トラップ解除判定",
    "2D+{感知}+{危険感知修正}+{判定BD}D>=0 危険感知判定",
    "2D+{知力}+{エネミー識別修正}+{判定BD}D>=0 エネミー識別判定",
    "2D+{知力}+{アイテム鑑定修正}+{判定BD}D>=0 アイテム鑑定判定",
    "{魔術D}D+{魔術判定}+{魔術判定修正}+{判定BD}D+{命中BD}D>=0 魔術判定",
    "{呪歌D}D+{呪歌判定}+{呪歌判定修正}+{判定BD}D>=0 呪歌判定",
    "{錬金術D}D+{錬金術判定}+{錬金術判定修正}+{判定BD}D>=0 錬金術判定",
  );

  const order = ["リソース操作", "戦闘前", "セットアップ", "イニシアチブ", "フリー", "ムーブ", "レガシー", "マイナー", "メジャー", "判定の直前", "判定の直後", "DR直前", "DR直後", "リアクション", "クリンナップ", "戦闘不能", "効果参照", "アイテム", "装備効果", "シーン終了時リセット", "シナリオ開始時リセット", "判定", "パッシブ"];
  const text = order.map((k) => `### ■${k}\n${(s.get(k) ?? []).join("\n")}`.trimEnd()).join("\n\n");
  return { text, warnings };
}
