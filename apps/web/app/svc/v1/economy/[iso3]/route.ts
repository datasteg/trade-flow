// Internal view (api/docs/SVC-CONTRACT.md): reached only over the Docker network by the api service; see lib/svc/.
import { svcGuard, svcLang } from '@/lib/svc';
import { respond, segment } from '@/lib/svc/core';
import { economyHook } from '@/lib/svc/hooks';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ iso3: string }> }) {
  const denied = svcGuard(req); if (denied) return denied;
  const url = new URL(req.url);
  const { iso3 } = await params;
  return respond(() => economyHook(segment(iso3), svcLang(url)));
}
