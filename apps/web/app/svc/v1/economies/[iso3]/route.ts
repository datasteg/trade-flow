// Internal view (api/docs/SVC-CONTRACT.md): reached only over the Docker network by the api service; see lib/svc/.
import { svcGuard, svcLang } from '@/lib/svc';
import { limitParam, param, respond, segment } from '@/lib/svc/core';
import { economyView, PARTNERS_DEFAULT, PARTNERS_MAX } from '@/lib/svc/trade';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ iso3: string }> }) {
  const denied = svcGuard(req); if (denied) return denied;
  const url = new URL(req.url);
  const { iso3 } = await params;
  return respond(() => economyView({
    iso3: segment(iso3), period: param(url, 'period'), product: param(url, 'product'), direction: param(url, 'direction'),
    limit: limitParam(url, PARTNERS_DEFAULT, PARTNERS_MAX), lang: svcLang(url),
  }));
}
