export type Parameter = { label: string; value: string };
type Row = { label: string; value: string };

// Match the editor's supported row delimiters without evaluating arbitrary code.
function row(text: string): Row | null {
  const s = text.trim();
  if (!s) return null;
  const parts = s.includes("\t") ? s.split("\t") : /[=＝,，/]/.test(s) ? s.split(/\s*[=＝,，/]\s*/) : s.split(/\s+/);
  return parts.length === 2 && parts[0].trim() && parts[1].trim()
    ? { label: parts[0].trim(), value: parts[1].trim() } : null;
}
function rows(text: string): Map<string, string> {
  const result = new Map<string, string>();
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const item = row(line);
    if (!item) throw new Error("パラメータは1行に「ラベル 値」で入力してください。切り替え前の内容を保持しました。");
    if (result.has(item.label)) throw new Error(`パラメータ「${item.label}」が重複しています。切り替え前の内容を保持しました。`);
    result.set(item.label, item.value);
  }
  return result;
}

/** Numbers, references and arithmetic only. No eval, functions, dice or implicit defaults. */
function evaluate(label: string, values: Map<string, string>, stack = new Set<string>(), budget = { remaining: 4096 }): number {
  if (--budget.remaining < 0) throw new Error("式が複雑すぎます。");
  if (stack.has(label) || stack.size >= 32) throw new Error("参照が循環しています。");
  const value = values.get(label);
  if (value === undefined || value.length > 1024) throw new Error("参照先を確認できません。");
  const nextStack = new Set(stack); nextStack.add(label);
  const tokens = value.match(/\{[^{}]+\}|\d+(?:\.\d+)?|[()+*/-]|\S/g) ?? [];
  if (tokens.length > 256) throw new Error("式が長すぎます。");
  let at = 0;
  const primary = (): number => {
    const t = tokens[at++];
    if (t === "+") return primary();
    if (t === "-") return -primary();
    if (t === "(") { const n = sum(); if (tokens[at++] !== ")") throw new Error("括弧を確認してください。"); return n; }
    if (t && /^\{[^{}]+\}$/.test(t)) return evaluate(t.slice(1, -1), values, nextStack, budget);
    if (t && /^\d+(?:\.\d+)?$/.test(t)) return Number(t);
    throw new Error("数値として計算できません。");
  };
  const product = (): number => {
    let n = primary();
    while (tokens[at] === "*" || tokens[at] === "/") {
      const op = tokens[at++], rhs = primary(); n = op === "*" ? n * rhs : n / rhs;
    }
    return n;
  };
  const sum = (): number => {
    let n = product();
    while (tokens[at] === "+" || tokens[at] === "-") {
      const op = tokens[at++], rhs = product(); n = op === "+" ? n + rhs : n - rhs;
    }
    return n;
  };
  const n = sum();
  if (at !== tokens.length || !Number.isFinite(n) || Math.abs(n) > Number.MAX_SAFE_INTEGER) throw new Error("数値として計算できません。");
  return n;
}

/** Only untouched generated parameter values change; names/order/additions/deletions stay. */
export function switchParameterMode(
  text: string, baseline: string, formula: Parameter[], fixed: Parameter[], useFormula: boolean,
): { text: string; baseline: string; retained: string[]; changed: number } {
  const current = rows(text), before = rows(baseline);
  const formulas = new Map(formula.map(p => [p.label, p.value]));
  const numbers = new Map(fixed.map(p => [p.label, p.value]));
  const generated = (useFormula ? formula : fixed).map(p => ({ ...p }));
  const baselineRows = new Map(generated.map(p => [p.label, p]));
  const retained: string[] = []; let changed = 0;
  const result = text.split(/\r?\n/).map(line => {
    const item = row(line); if (!item) return line;
    const expression = formulas.get(item.label);
    if (!expression || expression === numbers.get(item.label)) return line;
    if (item.value !== before.get(item.label)) { retained.push(item.label); return line; }
    let value: string;
    try { value = useFormula ? expression : String(evaluate(item.label, current)); }
    catch { retained.push(item.label); return line; }
    baselineRows.get(item.label)!.value = value;
    if (value === item.value) return line;
    changed++;
    return `${item.label}\t${value}`;
  }).join(text.includes("\r\n") ? "\r\n" : "\n");
  return { text: result, baseline: generated.map(p => `${p.label}\t${p.value}`).join("\n"), retained, changed };
}
