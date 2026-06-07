import type { CustomCommandMap } from "../ytsheet/types";

export function parseCustomCommands(text: string): CustomCommandMap {
  if (!text.trim()) return {};
  try { return JSON.parse(text) as CustomCommandMap; } catch { return {}; }
}
