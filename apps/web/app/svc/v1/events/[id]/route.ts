// Internal view (api/docs/SVC-CONTRACT.md): reached only over the Docker network by the api service; see lib/svc/.
import { svcGuard, svcLang } from '@/lib/svc';
import { respond, segment } from '@/lib/svc/core';
import { eventView } from '@/lib/svc/catalog';

export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const denied = svcGuard(req); if (denied) return denied;
  const url = new URL(req.url);
  const { id } = await params;
  return respond(() => eventView(segment(id), svcLang(url)));
}
