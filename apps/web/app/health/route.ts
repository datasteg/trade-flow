// GET /health: the container healthcheck (ds-deploy waits for 200 before routing traffic).
export const dynamic = 'force-dynamic';

export function GET() {
  return Response.json(
    { status: 'ok', service: 'trade-flow', version: process.env.APP_VERSION ?? 'dev', built: process.env.BUILD_TIME,
      time: new Date().toISOString() },
    { headers: { 'cache-control': 'no-store' } },
  );
}
