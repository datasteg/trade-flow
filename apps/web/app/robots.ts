import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// Open to search engines: everything but the machine routes. The data route also sends its own
// x-robots-tag: noindex; the feed stays crawlable.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/data/', '/health', '/svc/'] }],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
