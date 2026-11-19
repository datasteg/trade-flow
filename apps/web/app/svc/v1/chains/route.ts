// Internal view (api/docs/SVC-CONTRACT.md): reached only over the Docker network by the api service; see lib/svc/.
import { svcGuard, svcLang } from '@/lib/svc';
import { respond } from '@/lib/svc/core';
import { chainsView } from '@/lib/svc/catalog';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = svcGuard(req); if (denied) return denied;
  const url = new URL(req.url);
  return respond(() => chainsView(svcLang(url)));
}
