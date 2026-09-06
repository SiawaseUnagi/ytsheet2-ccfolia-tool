import type { ParsedSheet, YtSkill } from "../ytsheet/types";
import { leadingAmount, normalizeEffect, type Amount } from "./expression";

export type RollKind = "check" | "damage" | "hpHeal" | "mpHeal" | "hpSet";
export type AttackKind = "weapon" | "melee" | "ranged" | "magic";
export type RollTarget = {
  id: string; title: string; kind: RollKind; base: Amount; suffix: string;
  skillName?: string; attack?: AttackKind; magic?: boolean; judge?: string; attribute?: string;
};
export type Modifier = {
  id: string; source: string; level?: number; effect: string; amount: Amount;
  kinds: RollKind[]; attack?: AttackKind; judge?: string; hitOnly?: boolean;
  magicOnly?: boolean; penetrationOnly?: boolean; diceOnly?: boolean; onlySkill?: string; attribute?: string;
  flag: string; conditional: boolean; condition: string;
};
export type Review = { source: string; reason: string; effect: string };
export type Analysis = { modifiers: Modifier[]; reviews: Review[] };

export function attackKind(skill: YtSkill): AttackKind | undefined {
  const text = normalizeEffect(skill.effect);
  if (/魔法攻撃を行(?:な)?う/.test(text)) return "magic";
  if (/白兵攻撃を行(?:な)?う/.test(text)) return "melee";
  if (/射撃攻撃を行(?:な)?う/.test(text)) return "ranged";
  if (/武器攻撃を行(?:な)?う/.test(text)) return "weapon";
  return undefined;
}

export function skillRolls(skill: YtSkill, index: number, reviews: Review[]): RollTarget[] {
  const effect = normalizeEffect(skill.effect);
  if (/パッシブ|アイテム/.test(skill.timing)) return [];
  const targets: RollTarget[] = [];
  const attack = attackKind(skill);
  const add = (kind: RollKind, base: Amount, suffix: string) => {
    targets.push({ id: `skill-${index}-${kind}-${targets.length}`, title: `《${skill.name}》 ${suffix}`, kind, base, suffix,
      skillName: skill.name, attack, magic: /魔術/.test(skill.judge) || attack === "magic", attribute: /[〈<]([^〉>]+)[〉>]属性/.exec(suffix)?.[1] });
  };
  // HP restoration and setting HP after revival intentionally have separate kinds.
  const sharedResources = /(?:【)?(?:HP|MP)(?:】)?(?:と|、|および)(?:【)?(?:HP|MP)(?:】)?を/.test(effect);
  if (sharedResources) reviews.push({ source: skill.name, reason: "HPとMPを同時に回復する記載は、現時点では手動で式を確認してください。", effect: skill.effect });
  for (const m of effect.matchAll(/(?:【)?(HP|MP)(?:】)?を\s*/g)) {
    if (sharedResources) continue;
    const value = leadingAmount(effect.slice(m.index! + m[0].length), skill.level);
    if (!value) continue;
    if (/^点?回復/.test(value.rest)) add(m[1] === "HP" ? "hpHeal" : "mpHeal", value.amount, `${m[1]}回復量`);
    else if (m[1] === "HP" && /^点?に(?:する|変更)/.test(value.rest)) add("hpSet", value.amount, "HP設定値（回復量とは別）");
  }
  if (attack === "magic") {
    const m = /ダメージは\s*/.exec(effect);
    const value = m ? leadingAmount(effect.slice(m.index + m[0].length), skill.level) : null;
    if (value && /^(?:[（(]|となる|点|$)/.test(value.rest)) {
      const info = value.rest.split("。")[0];
      const attribute = /[〈<]([^〉>]+)[〉>]/.exec(info)?.[1];
      const suffix = /貫通/.test(info) ? "貫通ダメージ" : attribute ? `〈${attribute}〉属性魔法ダメージ` : "魔法ダメージ（属性要確認）";
      add("damage", value.amount, suffix);
    } else reviews.push({ source: skill.name, reason: "魔法攻撃の基本ダメージを確定できません。式を手動で追加してください。", effect: skill.effect });
  } else if (attack) {
    add("damage", { dice: "{攻撃ダイス}", fixed: "{攻撃力}" }, "{ダメージ属性}ダメージ");
  }
  if (/(?:HP|MP).*回復|回復.*(?:HP|MP)/.test(effect) && targets.every(t => t.kind !== "hpHeal" && t.kind !== "mpHeal" && t.kind !== "hpSet")) {
    // A recovery boost is not a recovery action in its own right.
    if (!/回復[^。]*に\s*[+\-]/.test(effect)) reviews.push({ source: skill.name, reason: "回復量の式を確定できません。消費数・割合・上限などを確認してください。", effect: skill.effect });
  }
  return targets;
}

function attackScope(text: string): AttackKind | undefined {
  if (/白兵攻撃/.test(text)) return "melee";
  if (/射撃攻撃/.test(text)) return "ranged";
  if (/魔法攻撃/.test(text)) return "magic";
  if (/武器(?:攻撃|を使用)/.test(text)) return "weapon";
  return undefined;
}

function classify(prefix: string, full: string): Partial<Modifier> | null {
  if (/(?:あらゆる|すべての)ダイスロール/.test(prefix)) {
    return { kinds: ["check", "damage", "hpHeal", "mpHeal", "hpSet"], diceOnly: true };
  }
  if (/回復/.test(prefix) && /効果|回復量|回復/.test(prefix)) {
    if (/受ける|受けた|受けて/.test(prefix)) return null;
    const hp = /HP/.test(prefix), mp = /MP/.test(prefix);
    return { kinds: hp && !mp ? ["hpHeal"] : mp && !hp ? ["mpHeal"] : ["hpHeal", "mpHeal"], magicOnly: /分類[:：]魔術/.test(full), diceOnly: /効果をダイスで求める/.test(full) };
  }
  if (/ダメージ/.test(prefix)) {
    if (/受ける|軽減|HPロス/.test(prefix) || /ダメージ軽減/.test(full)) return null;
    return { kinds: ["damage"], attack: attackScope(prefix) ?? attackScope(full), penetrationOnly: /貫通ダメージ.*有効/.test(full) };
  }
  if (/判定/.test(prefix)) {
    const name = /(魔術|呪歌|錬金術|命中|回避|筋力|器用|敏捷|知力|感知|精神|幸運)/.exec(prefix)?.[1];
    if (!name) return null;
    return { kinds: ["check"], judge: name === "命中" ? undefined : name, hitOnly: name === "命中", attack: attackScope(prefix) };
  }
  return null;
}

export function analyzeModifiers(sheet: ParsedSheet): Analysis {
  const modifiers: Modifier[] = [], reviews: Review[] = [];
  const sources = sheet.skills.map((skill, index) => ({ name: skill.name, level: skill.level, timing: skill.timing,
    effect: skill.effect, usage: skill.usage, ownAttack: attackKind(skill), id: `skill-${index}` }));
  for (const slot of ["HandR", "HandL", "Head", "Body", "Sub", "Other"]) {
    const name = String(sheet.raw[`armament${slot}Name`] ?? "").trim();
    const effect = String(sheet.raw[`armament${slot}Note`] ?? "").trim();
    if (name && effect) sources.push({ name, level: 0, timing: "装備", effect, usage: "", ownAttack: undefined, id: `item-${slot}` });
  }
  for (const source of sources) {
    const full = normalizeEffect(`${source.effect} ${source.usage}`);
    const relevant = /(?:ダメージ|回復|判定|ダイスロール)[^。]*に\s*[+\-]/.test(full);
    if (!relevant) continue;
    if (/[{}\r\n]/.test(source.name)) { reviews.push({ source: source.name, reason: "変数名として使えない文字を含むため手動で調整してください。", effect: source.effect }); continue; }
    // Do not reinterpret replacement text, examples, or effects that modify another skill.
    if (/(?:《[^》]+》の(?:「?効果|ダメージ)|「効果」)[^。]*(?:変更|追加)|効果を[^。]*変更/.test(full)) {
      reviews.push({ source: source.name, reason: "別スキルの効果を書き換えるため、自動では加算しません。", effect: source.effect }); continue;
    }
    let found = false;
    for (const sentence of normalizeEffect(source.effect).split("。")) {
      for (const m of sentence.matchAll(/に\s*([+\-])\s*/g)) {
        const prefix = sentence.slice(0, m.index);
        const type = classify(prefix, full);
        if (!type?.kinds) continue;
        const parsed = leadingAmount(sentence.slice(m.index! + m[0].length), source.level);
        if (!parsed || !/^(?:点|する|させ|$|[、,」])/.test(parsed.rest)) continue;
        const amount = m[1] === "-" ? {
          dice: parsed.amount.dice === "0" ? "0" : `-(${parsed.amount.dice})`,
          fixed: parsed.amount.fixed === "0" ? "0" : `-(${parsed.amount.fixed})`,
        } : parsed.amount;
        if (source.timing === "装備" && /SL/.test(sentence.slice(m.index))) continue;
        const active = !/パッシブ|装備/.test(source.timing) && !source.ownAttack;
        const conditional = active || /時|場合|いる間|効果中|クリティカル|場所|受けている|終了まで|暗闇|狂戦士化/.test(full) || /装備|使用/.test(source.usage);
        const limited = /(?:シーン|シナリオ|ラウンド).{0,12}回/.test(source.usage);
        // Equipment can use its own name; ensureCorrectionFlag handles existing-name collisions.
        const flag = limited || /^(?:HP|MP|CL|フェイト|攻撃力|移動力)$/.test(source.name) ? `${source.name}_補正` : source.name;
        modifiers.push({ id: `${source.id}-${modifiers.length}`, source: source.name,
          level: source.timing === "装備" ? undefined : source.level,
          effect: `${source.effect}${source.usage && source.usage !== "―" ? ` 使用条件：${source.usage}` : ""}`,
          amount, kinds: type.kinds, ...type, attribute: /[〈<]([^〉>]+)[〉>]属性/.exec(prefix)?.[1], flag, conditional,
          condition: conditional ? "条件・持続時間・適用対象を原文で確認してください。" : "ゆとシートに反映済みなら選ばないでください。",
          onlySkill: source.ownAttack ? source.name : undefined });
        found = true;
      }
    }
    if (!found) reviews.push({ source: source.name, reason: "補正の対象または数式を確定できません。手動で調整してください。", effect: source.effect });
  }
  return { modifiers, reviews };
}

export function compatible(modifier: Modifier, target: RollTarget): boolean {
  if (!modifier.kinds.includes(target.kind)) return false;
  if (modifier.attribute && modifier.attribute !== target.attribute) return false;
  if (modifier.onlySkill && modifier.onlySkill !== target.skillName) return false;
  if (modifier.magicOnly && !target.magic) return false;
  if (modifier.penetrationOnly && !/貫通/.test(target.suffix)) return false;
  if (modifier.diceOnly && target.base.dice === "0") return false;
  if (modifier.judge && !target.judge?.includes(modifier.judge)) return false;
  if (modifier.hitOnly && !target.attack) return false;
  if (modifier.attack === "magic" && target.attack !== "magic") return false;
  if (modifier.attack && modifier.attack !== "magic") {
    if (!target.attack || target.attack === "magic") return false;
    // Generic weapon lines have no melee/ranged information: show a warning in the UI.
    if (modifier.attack !== "weapon" && target.attack !== "weapon" && modifier.attack !== target.attack) return false;
  }
  return true;
}