// Internal view (api/docs/SVC-CONTRACT.md): reached only over the Docker network by the api service; see lib/svc/.
import { svcGuard } from '@/lib/svc';
import { respond } from '@/lib/svc/core';
import { manifest } from '@/lib/svc/hooks';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = svcGuard(req); if (denied) return denied;
  return respond(() => manifest());
}
