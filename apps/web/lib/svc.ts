// lib/svc.ts: the guard and response helpers for /svc/v1 (see api/docs/SVC-CONTRACT.md)
const PUBLIC = /\./; // public hosts have dots (money-flow.datasteg.com); Docker service names do not (money-flow)
export function svcGuard(req: Request): Response | null {
  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const fwd = (req.headers.get("x-forwarded-host") || "").split(":")[0].toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1";
  if ((!local && PUBLIC.test(host)) || (fwd && PUBLIC.test(fwd) && fwd !== "127.0.0.1")) return svcError(404, "not-found", "Not found", "No such path.");
  const token = process.env.DATASTEG_SVC_TOKEN;
  if (token && req.headers.get("x-datasteg-gateway") !== token) return svcError(404, "not-found", "Not found", "No such path.");
  return null;
}
const HDRS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" };
export function svcJson(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: HDRS });
}
export function svcError(status: number, type: string, title: string, detail: string): Response {
  return svcJson({ error: { status, type, title, detail } }, status);
}
export function svcLang(url: URL): "en" | "ko" { return url.searchParams.get("lang") === "ko" ? "ko" : "en"; }
