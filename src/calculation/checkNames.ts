/** Match the whole named check, so 危険感知 never becomes a generic 感知 check. */
const names = ["トラップ探知", "トラップ解除", "危険感知", "エネミー識別", "アイテム鑑定", "錬金術", "魔術", "呪歌", "命中", "回避", "筋力", "器用", "敏捷", "知力", "感知", "精神", "幸運"];
const namePattern = names.join("|");
const token = `(?:【)?(?:${namePattern})(?:】)?`;
const chainPattern = `${token}(?:判定)?(?:\\s*(?:と|や|、|,|および|及び|または|もしくは|か)\\s*${token}(?:判定)?)*(?:の)?判定`;
function namedGroups(text: string): string[][] {
  return [...text.matchAll(new RegExp(chainPattern, "g"))].map(match =>
    [...new Set([...match[0].matchAll(new RegExp(namePattern, "g"))].map(m => m[0]))]);
}
/** Prefer the check immediately before the bonus. Resolve その判定 only from an
 * unambiguous preceding sentence, never from an unrelated ability in the effect. */
export function checkModifierNames(prefix: string, preceding = ""): string[] {
  const groups = namedGroups(prefix);
  if (groups.length) return groups[groups.length - 1];
  if (!/その判定/.test(prefix)) return [];
  const previous = preceding.split("。").filter(s => s.trim()).pop() ?? "";
  const mentioned = [...new Set(namedGroups(previous).flat())];
  return mentioned.length === 1 ? mentioned : [];
}
export function matchesCheckNames(scope: string, judge: string, attackCheck = false): boolean {
  const target = judge.replace(/[【】\s]/g, "").replace(/[（(].*$/, "").replace(/(?:の)?判定$/, "");
  return scope.split("|").some(name => name === target || (name === "命中" && attackCheck));
}
