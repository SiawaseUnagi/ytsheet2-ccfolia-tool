export function toJsonUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.set("mode", "json");
  return u.toString();
}

export async function fetchYtsheetJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(toJsonUrl(url));
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}
