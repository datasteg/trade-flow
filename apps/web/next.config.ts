import path from 'node:path';
import type { NextConfig } from 'next';

const dev = process.env.NODE_ENV === 'development';

// A public site whose pages load nothing from another origin except the visitor count (an image request to
// stats.datasteg.com). `next dev` also needs eval for React's error overlay and stack traces.
const CSP = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https://stats.datasteg.com",
  "font-src 'self'",
  "connect-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');

const config: NextConfig = {
  // NEXT_DIST_DIR lets parallel local builds keep apart (e.g. .next-explore); the image uses .next.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  // A self-contained server (node apps/web/server.js) for the container image.
  output: 'standalone',
  // Monorepo: trace files from the workspace root so the workspace packages are included.
  outputFileTracingRoot: path.join(__dirname, '../..'),
  // The generated data folder is read at run time from DATA_DIR (lib/data.ts), never bundled or traced.
  outputFileTracingExcludes: { '*': ['../../data/**'] },
  transpilePackages: ['@larch/ui', '@larch/net', '@larch/fonts', '@larch/design'],
  images: { unoptimized: true },
  // Local previews load the dev server from 127.0.0.1; without this the client bundle is blocked.
  allowedDevOrigins: ['127.0.0.1'],
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/((?!_next/static).*)',
      headers: [
        { key: 'Content-Security-Policy', value: CSP },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
      ],
    }];
  },
  env: {
    APP_VERSION: process.env.APP_VERSION ?? 'dev',
    BUILD_TIME: process.env.BUILD_TIME ?? new Date().toISOString(),
  },
};

export default config;
