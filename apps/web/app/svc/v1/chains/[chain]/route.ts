// Internal view (api/docs/SVC-CONTRACT.md): reached only over the Docker network by the api service; see lib/svc/.
import { svcGuard, svcLang } from '@/lib/svc';
import { param, respond, segment } from '@/lib/svc/core';
import { chainView } from '@/lib/svc/catalog';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ chain: string }> }) {
  const denied = svcGuard(req); if (denied) return denied;
  const url = new URL(req.url);
  const { chain } = await params;
  return respond(() => chainView({ chain: segment(chain), economy: param(url, 'economy'), year: param(url, 'year'), lang: svcLang(url) }));
}
