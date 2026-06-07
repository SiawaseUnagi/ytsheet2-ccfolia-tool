const ALLOWED_HOSTS = new Set(["yutorize.work", "www.yutorize.work"]);

export function toJsonUrl(url: string): string {
  const u = new URL(url);
  if (!ALLOWED_HOSTS.has(u.hostname)) {
    throw new Error("ゆとシートURLは yutorize.work のものだけ使えます。");
  }
  u.searchParams.set("mode", "json");
  return u.toString();
}

export async function fetchYtsheetJson(url: string): Promise<Record<string, unknown>> {
  const res = await fetch(toJsonUrl(url));
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  return (await res.json()) as Record<string, unknown>;
}
