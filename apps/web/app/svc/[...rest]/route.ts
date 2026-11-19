// Any other path under /svc: the error envelope, never a page (api/docs/SVC-CONTRACT.md).
import { svcError, svcGuard } from '@/lib/svc';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = svcGuard(req); if (denied) return denied;
  return svcError(404, 'not-found', 'Not found', 'No such view. GET /svc/v1/manifest lists the views trade-flow answers.');
}
