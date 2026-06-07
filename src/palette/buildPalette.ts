import type { CustomCommandMap, ParsedSheet } from "../ytsheet/types";
import { skillToLines } from "./buildSkillCommands";

function sec() { return new Map<string, string[]>([["リソース操作",[":HP+",":HP-",":MP+",":MP-",":フェイト-","","2D　ドロップ品（）"]],["セットアッププロセス",[]],["イニシアチブプロセス",[]],["ムーブアクション",["ムーブアクション放棄。","ムーブアクションで戦闘移動を行なう。({移動力}m)","ムーブアクションで全力移動を行なう。({移動力}+5m)","ムーブアクションで離脱を行なう。"]],["マイナーアクション",["マイナーアクション放棄。","マイナーでHPPを使用。","マイナーでMPPを使用。","マイナーでHHPPを使用。","マイナーでHMPPを使用。","マイナーで毒消しを使用。"]],["メジャーアクション",["メジャーアクションで武器攻撃を行う。"]],["DR直前",[]],["DR直後",[]],["判定直前",[]],["判定直後",[]],["クリンナッププロセス",[]],["シーン終了時リセット",[]],["シナリオ開始時リセット",[]],["攻撃",[]],["判定",[]],["効果参照",[]]]); }

function mapTiming(t: string): string {
  if (/セットアップ/.test(t)) return "セットアッププロセス";
  if (/イニシアチブ/.test(t)) return "イニシアチブプロセス";
  if (/ムーブ/.test(t)) return "ムーブアクション";
  if (/マイナー/.test(t)) return "マイナーアクション";
  if (/メジャー/.test(t)) return "メジャーアクション";
  if (/DR|ダメージロール.*直前/.test(t)) return "DR直前";
  if (/ダメージロール.*直後/.test(t)) return "DR直後";
  if (/判定.*直前/.test(t)) return "判定直前";
  if (/判定.*直後/.test(t)) return "判定直後";
  if (/クリンナップ/.test(t)) return "クリンナッププロセス";
  return "効果参照";
}

export function buildPalette(sheet: ParsedSheet, custom: CustomCommandMap): { text: string; warnings: string[] } {
  const s = sec();
  const warnings = [...sheet.warnings];
  for (const sk of sheet.skills) {
    const target = mapTiming(sk.timing);
    const out = skillToLines(sk, custom);
    s.get(target)?.push(...out.lines, "");
    for (const r of out.resets) s.get(r.scope === "scene" ? "シーン終了時リセット" : "シナリオ開始時リセット")?.push(r.line);
    if (!out.usageLimit && /シーン|シナリオ/.test(`${sk.usage} ${sk.effect}`)) warnings.push(`《${sk.name}》：使用制限を読み取れませんでした。`);
  }
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
    "{魔術D}D+{魔術判定}+{魔術判定修正}+{判定BD}D+{命中BD}D>=0 魔術判定",
  );
  if (sheet.weapons.length <= 1) s.get("攻撃")?.push("{命中D}D+{命中判定}+{命中判定修正}+{判定BD}D+{命中BD}D>=0 命中判定","{攻撃力D}D+{攻撃力}+{ダメBD}D+{ダメバフ} 物理ダメージ");
  else for (const w of sheet.weapons) s.get("攻撃")?.push(`### ■攻撃：${w.name}`,`メジャーアクションで${w.name}による武器攻撃を行う。`,`{${w.name}_命中D}D+{${w.name}_命中判定}+{命中判定修正}+{判定BD}D+{命中BD}D>=0 命中判定　＠${w.name}`,`{${w.name}_攻撃力D}D+{${w.name}_攻撃力}+{ダメBD}D+{ダメバフ} 物理ダメージ　＠${w.name}`,""
  );
  const order = ["リソース操作","セットアッププロセス","イニシアチブプロセス","ムーブアクション","マイナーアクション","メジャーアクション","DR直前","DR直後","判定直前","判定直後","クリンナッププロセス","シーン終了時リセット","シナリオ開始時リセット","攻撃","判定","効果参照"];
  const text = order.map((k) => `### ■${k}\n${(s.get(k) ?? []).join("\n")}`.trimEnd()).join("\n\n");
  return { text, warnings };
}
