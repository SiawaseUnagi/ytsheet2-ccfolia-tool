import type { Fields } from "../session/model";
import { parseStatusText, parseParamsText } from "../editor/rows";

export function metadataOnly(json: string): string {
  const parsed = JSON.parse(json);
  if (
    parsed?.kind !== "character" ||
    !parsed.data ||
    typeof parsed.data !== "object" ||
    Array.isArray(parsed.data)
  )
    throw new Error("ココフォリアJSONの形式を確認してください。");
  const { status: _status, params: _params, commands: _commands, ...data } = parsed.data;
  return JSON.stringify({ ...parsed, data });
}
export function characterJson(fields: Fields): string {
  const meta = JSON.parse(metadataOnly(fields.metadata));
  return JSON.stringify(
    {
      ...meta,
      data: {
        ...meta.data,
        status: parseStatusText(fields.statusEdit),
        params: parseParamsText(fields.paramsEdit),
        commands: fields.palette,
      },
    },
    null,
    2,
  );
}
