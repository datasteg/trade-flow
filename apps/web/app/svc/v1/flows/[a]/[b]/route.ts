// Internal view (api/docs/SVC-CONTRACT.md): reached only over the Docker network by the api service; see lib/svc/.
import { svcGuard, svcLang } from '@/lib/svc';
import { param, respond, segment } from '@/lib/svc/core';
import { bilateralView } from '@/lib/svc/trade';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ a: string; b: string }> }) {
  const denied = svcGuard(req); if (denied) return denied;
  const url = new URL(req.url);
  const { a, b } = await params;
  return respond(() => bilateralView({ a: segment(a), b: segment(b), product: param(url, 'product'), period: param(url, 'period'), lang: svcLang(url) }));
}
