import type { CalculationState } from "../calculation/sessionState";

export type Fields = { statusEdit: string; paramsEdit: string; palette: string; metadata: string };
export type Snapshot = {
  key: string; name: string; url: string; savedAt: string; useFormula: boolean;
  raw: Record<string, unknown>; calculation: CalculationState; base: Fields; working: Fields;
};
export type SaveFile = { format: "ytsheet2-ccfolia-session"; version: 1; current: Snapshot; previous?: Snapshot };
export const MAX_FILE_BYTES = 4000000;
export const SAVE_PREFIX = "ytsheet2-ccfolia:session:v1:";

export function sheetKey(input: string): string {
  const url = new URL(input);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw new Error("保存にはhttp(s)のキャラシURLが必要です。");
  const id = url.searchParams.get("id");
  if (!id) throw new Error("キャラシURLの id が見つかりません。");
  return `${url.origin}${url.pathname}?id=${encodeURIComponent(id)}`;
}
export function assertSheetIdentity(raw: Record<string, unknown>, url: string): string {
  const key = sheetKey(url), id = new URL(key).searchParams.get("id");
  if (raw.id != null && String(raw.id) !== id) throw new Error("URLと読み込んだキャラシのIDが一致しません。編集内容は変更していません。");
  if (typeof raw.sheetURL === "string" && raw.sheetURL && sheetKey(raw.sheetURL) !== key) throw new Error("読み込んだキャラシが保存元と異なります。別のキャラとして出力してください。");
  if (raw.result && raw.result !== "OK") throw new Error("キャラシの取得に失敗しました。");
  return key;
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function str(value: unknown, max = 1500000): value is string { return typeof value === "string" && value.length <= max; }
function jsonSafety(root: unknown): void {
  let nodes = 0;
  const scan = (x: unknown, depth: number) => {
    if (++nodes > 100000 || depth > 32) throw new Error("保存ファイルの構造が大きすぎます。");
    if (x && typeof x === "object") {
      for (const [key, value] of Object.entries(x)) {
        if (["__proto__", "constructor", "prototype"].includes(key)) throw new Error("保存ファイルに安全に読み込めない項目があります。");
        scan(value, depth + 1);
      }
    }
  };
  scan(root, 0);
}
function fields(value: unknown): value is Fields {
  if (!record(value) || !["statusEdit", "paramsEdit", "palette", "metadata"].every(k => str(value[k]))) return false;
  const meta = JSON.parse(value.metadata as string);
  jsonSafety(meta);
  return record(meta) && meta.kind === "character" && record(meta.data);
}
function calculation(value: unknown): value is CalculationState {
  if (!record(value) || value.version !== 1 || !Array.isArray(value.flags) || !Array.isArray(value.choices)) return false;
  if (value.flags.length > 3000 || value.choices.length > 20000) return false;
  return value.flags.every(f => record(f) && str(f.key, 500) && str(f.name, 120) && (f.actual === undefined || str(f.actual, 120))) &&
    value.choices.every(c => record(c) && str(c.target, 3000) && str(c.modifier, 30000) && typeof c.checked === "boolean" && typeof c.toggle === "boolean");
}
function snapshot(value: unknown): value is Snapshot {
  if (!record(value) || !str(value.key, 3000) || !str(value.url, 3000) || !str(value.name, 1000) ||
      !str(value.savedAt, 100) || !Number.isFinite(Date.parse(value.savedAt as string)) || typeof value.useFormula !== "boolean" ||
      !record(value.raw) || !fields(value.base) || !fields(value.working) || !calculation(value.calculation)) return false;
  return value.key === assertSheetIdentity(value.raw, value.url as string);
}
export function parseSaveFile(text: string): SaveFile {
  if (new TextEncoder().encode(text).length > MAX_FILE_BYTES) throw new Error("保存ファイルは4MB以内にしてください。");
  let value: unknown;
  try { value = JSON.parse(text); } catch { throw new Error("保存ファイルを読み取れません。JSON形式の保存ファイルを選んでください。"); }
  jsonSafety(value);
  if (!record(value) || value.format !== "ytsheet2-ccfolia-session" || value.version !== 1) throw new Error("このツールの対応する保存ファイルではありません。ココフォリアJSONとは形式が異なります。");
  if (!snapshot(value.current) || (value.previous !== undefined && !snapshot(value.previous))) throw new Error("保存ファイルの必要な項目が不足しているか、形式が異なります。");
  if (value.previous && (value.previous as Snapshot).key !== (value.current as Snapshot).key) throw new Error("更新前の記録が別のキャラクターです。");
  return value as SaveFile;
}
export const fileFor = (current: Snapshot, previous?: Snapshot): SaveFile => ({ format: "ytsheet2-ccfolia-session", version: 1, current, ...(previous ? { previous } : {}) });
export function serializeSaveFile(file: SaveFile): string {
  const text = JSON.stringify(file);
  parseSaveFile(text); // Validate our own output before replacing an existing save.
  return text;
}
export const fingerprint = (session: Snapshot): string => JSON.stringify([session.key, session.useFormula, session.working, session.calculation]);

export type SaveSummary = { key: string; name: string; savedAt: string };
/** Writes one complete envelope atomically. Never clears other sites or other characters. */
export class BrowserSaves {
  constructor(private storage: Pick<Storage, "length" | "key" | "getItem" | "setItem" | "removeItem">) {}
  read(key: string): SaveFile | null {
    const text = this.storage.getItem(SAVE_PREFIX + encodeURIComponent(key));
    return text === null ? null : parseSaveFile(text);
  }
  write(file: SaveFile): void {
    const text = serializeSaveFile(file);
    this.storage.setItem(SAVE_PREFIX + encodeURIComponent(file.current.key), text);
  }
  list(): { saves: SaveSummary[]; damaged: number } {
    const saves: SaveSummary[] = []; let damaged = 0;
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(SAVE_PREFIX)) continue;
      try {
        const value = parseSaveFile(this.storage.getItem(key) ?? "").current;
        saves.push({ key: value.key, name: value.name, savedAt: value.savedAt });
      } catch { damaged++; } // Do not overwrite or delete unreadable old data.
    }
    return { saves: saves.sort((a, b) => b.savedAt.localeCompare(a.savedAt)), damaged };
  }
  remove(key: string): void { this.storage.removeItem(SAVE_PREFIX + encodeURIComponent(key)); }
}
