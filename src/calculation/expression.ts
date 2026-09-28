/** Small, non-executing parser: SL is resolved; CL and abilities remain references. */
export type Amount = { dice: string; fixed: string; fixedExpression?: string };
// Calculation and display have separate provenance. Never infer SL from a folded number.
type Process = { text: string; priority: number; hasSL: boolean; level?: boolean };
type Scalar = { text: string; number?: number; process?: Process };
const processOf = (s: Scalar): Process => s.process ?? { text: s.text, priority: 3, hasSL: false };
const processOperand = (p: Process, priority: number): string =>
  p.priority < priority || p.text.startsWith("-") ? `(${p.text})` : p.text;
type Value = { dice: Scalar; fixed: Scalar };
const ABILITIES = ["筋力", "器用", "敏捷", "知力", "感知", "精神", "幸運"];
const num = (n: number): Scalar => ({ text: String(n), number: n });
const zero = (): Value => ({ dice: num(0), fixed: num(0) });
const wrap = (s: Scalar) =>
  s.number !== undefined || /^\{[^{}]+\}$/.test(s.text) ? s.text : `(${s.text})`;

function foldedAdd(a: Scalar, b: Scalar, sign = 1): Scalar {
  if (a.number !== undefined && b.number !== undefined) return num(a.number + sign * b.number);
  if (b.number === 0) return a;
  if (a.number === 0) return sign === 1 ? b : { text: `-(${b.text})` };
  return { text: `${a.text}${sign === 1 ? "+" : "-"}${wrap(b)}` };
}
function foldedMul(a: Scalar, b: Scalar): Scalar {
  if (a.number === 0 || b.number === 0) return num(0);
  if (a.number !== undefined && b.number !== undefined) return num(a.number * b.number);
  if (a.number === 1) return b;
  if (b.number === 1) return a;
  return { text: `${wrap(a)}*${wrap(b)}` };
}

function add(a: Scalar, b: Scalar, sign = 1): Scalar {
  if (a.number === 0 && !a.process) return sign === 1 ? b : negate(b);
  if (b.number === 0 && !b.process) return a;
  const left = processOf(a),
    right = processOf(b);
  return {
    ...foldedAdd(a, b, sign),
    process: {
      text: `${left.text}${sign === 1 ? "+" : "-"}${processOperand(right, 2)}`,
      priority: 1,
      hasSL: left.hasSL || right.hasSL,
    },
  };
}
function mul(a: Scalar, b: Scalar): Scalar {
  let left = processOf(a),
    right = processOf(b);
  // The requested simple SL×coefficient display is coefficient×resolved level.
  // Do not reorder compound expressions, subtraction or ability references.
  if (left.level && !right.hasSL && /^\d+(?:\.\d+)?$/.test(right.text))
    [left, right] = [right, left];
  return {
    ...foldedMul(a, b),
    process: {
      text: `${processOperand(left, 2)}*${processOperand(right, 2)}`,
      priority: 2,
      hasSL: left.hasSL || right.hasSL,
    },
  };
}
function negate(a: Scalar): Scalar {
  if (a.number === 0 && !a.process) return a;
  const p = processOf(a);
  return {
    ...foldedMul(num(-1), a),
    process: {
      text: `-${processOperand(p, 3)}`,
      priority: 2,
      hasSL: p.hasSL,
    },
  };
}

export function normalizeEffect(text: string): string {
  return text
    .replace(/&lt;br\s*\/?&gt;|<br\s*\/?>/gi, " ")
    .normalize("NFKC")
    .replace(/[×✕]/g, "*")
    .replace(/[−–－]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseAmount(
  input: string,
  skillLevel: number,
  preserveFixedExpression = false,
): Amount | null {
  if (!Number.isInteger(skillLevel) || skillLevel < 0 || input.length > 200) return null;
  let text = normalizeEffect(input)
    .replace(/【([^】]+)】/g, "{$1}")
    .replace(/[［\[]/g, "(")
    .replace(/[］\]]/g, ")")
    .replace(/\s/g, "")
    .replace(/\b(SL|CL)x(?=\d)/gi, "$1*");
  const tokens: string[] = [];
  const re = /\{(?:CL|筋力|器用|敏捷|知力|感知|精神|幸運)\}|SL|CL|\d+(?:\.\d+)?|D6|D|[()+*\-]/gy;
  let offset = 0;
  while (offset < text.length) {
    re.lastIndex = offset;
    const match = re.exec(text);
    if (!match || tokens.length >= 100) return null;
    tokens.push(match[0]);
    offset = re.lastIndex;
  }
  let i = 0,
    depth = 0;
  function atom(): Value {
    if (++depth > 24) throw new Error("deep");
    let result: Value;
    const token = tokens[i++];
    if (token === "(") {
      result = sum();
      if (tokens[i++] !== ")") throw new Error("unclosed");
    } else if (token === "+" || token === "-") {
      const a = atom();
      result = {
        dice: token === "-" ? negate(a.dice) : a.dice,
        fixed: token === "-" ? negate(a.fixed) : a.fixed,
      };
    } else if (token === "SL")
      result = {
        ...zero(),
        fixed: {
          ...num(skillLevel),
          process: { text: String(skillLevel), priority: 3, hasSL: true, level: true },
        },
      };
    else if (token === "CL" || token === "{CL}" || ABILITIES.some((a) => token === `{${a}}`)) {
      result = { ...zero(), fixed: { text: token === "CL" ? "{CL}" : token } };
    } else if (token && /^\d+(?:\.\d+)?$/.test(token))
      result = {
        ...zero(),
        fixed: { ...num(Number(token)), process: { text: token, priority: 3, hasSL: false } },
      };
    else throw new Error("token");
    if (tokens[i] === "D" || tokens[i] === "D6") {
      i++;
      if (result.dice.number !== 0) throw new Error("nested dice");
      result = { dice: result.fixed, fixed: num(0) };
    }
    depth--;
    return result;
  }
  function product(): Value {
    let a = atom();
    while (tokens[i] === "*") {
      i++;
      const b = atom();
      // Multiplying a rolled total is not equivalent to adding more dice.
      if (a.dice.number !== 0 || b.dice.number !== 0) throw new Error("roll product unsupported");
      a = { dice: num(0), fixed: mul(a.fixed, b.fixed) };
    }
    return a;
  }
  function sum(): Value {
    let a = product();
    while (tokens[i] === "+" || tokens[i] === "-") {
      const sign = tokens[i++] === "+" ? 1 : -1;
      const b = product();
      a = { dice: add(a.dice, b.dice, sign), fixed: add(a.fixed, b.fixed, sign) };
    }
    return a;
  }
  try {
    const value = sum();
    if (i !== tokens.length || tokens.length === 0) return null;
    for (const v of [value.dice, value.fixed]) {
      if (v.number !== undefined && (!Number.isFinite(v.number) || Math.abs(v.number) > 1000000))
        return null;
    }
    if (value.dice.number !== undefined && !Number.isInteger(value.dice.number)) return null;
    return {
      dice: value.dice.text,
      fixed: value.fixed.text,
      ...(preserveFixedExpression && value.fixed.process?.hasSL
        ? { fixedExpression: value.fixed.process.text }
        : {}),
    };
  } catch {
    return null;
  }
}

/** Read only an explicit numeric expression, stopping before Japanese prose. */
export function leadingAmount(
  text: string,
  level: number,
  preserveFixedExpression = false,
): { amount: Amount; rest: string } | null {
  const s = normalizeEffect(text).trim();
  let end = 0,
    balance = 0;
  while (end < s.length) {
    const tail = s.slice(end);
    const m =
      /^(?:【(?:筋力|器用|敏捷|知力|感知|精神|幸運)】|\{(?:CL|筋力|器用|敏捷|知力|感知|精神|幸運)\}|SL|CL|\d+(?:\.\d+)?|D6|D|[+*x\-\s])/.exec(
        tail,
      );
    if (m) {
      end += m[0].length;
      continue;
    }
    const ch = s[end];
    if (ch === "[" || ch === "(") {
      // Parenthesized prose after a damage expression is not part of the formula.
      const next = s.slice(end + 1).trimStart();
      if (!/^(?:\d|SL|CL|D|[+\-(\[【{])/.test(next)) break;
      balance++;
      end++;
      continue;
    }
    if (ch === "]" || ch === ")") {
      if (balance <= 0) break;
      balance--;
      end++;
      continue;
    }
    break;
  }
  const amount = parseAmount(s.slice(0, end).trim(), level, preserveFixedExpression);
  return amount ? { amount, rest: s.slice(end) } : null;
}

export function addTerm(base: string, extra: string): string {
  if (!extra || extra === "0") return base;
  if (!base || base === "0") return extra;
  return `${base}${extra.startsWith("-") ? "" : "+"}${extra}`;
}
export function gatedTerm(term: string, flag: string | undefined): string {
  if (term === "0" || !flag) return term;
  if (term === "1") return `{${flag}}`;
  // Base abilities are numeric parameters. Keep composite terms grouped.
  const atomic = /^\{(?:CL|筋力|器用|敏捷|知力|感知|精神|幸運)\}$/.test(term);
  return `{${flag}}*${atomic ? term : `(${term})`}`;
}
