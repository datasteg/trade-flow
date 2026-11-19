// Internal view (api/docs/SVC-CONTRACT.md): reached only over the Docker network by the api service; see lib/svc/.
import { svcGuard, svcLang } from '@/lib/svc';
import { param, respond } from '@/lib/svc/core';
import { supplierCutView } from '@/lib/svc/tool';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const denied = svcGuard(req); if (denied) return denied;
  const url = new URL(req.url);
  return respond(() => supplierCutView({ stage: param(url, 'stage'), exporter: param(url, 'exporter'), cut: param(url, 'cut'), lang: svcLang(url) }));
}
