// The OpenGraph card (opengraph-image.tsx routes): a Larch canopy plate with a kicker, the page title and a foot
// line, rendered by next/og at build time. Fonts come from the workspace's font packages (Fira Sans for Latin,
// Pretendard for Hangul); without them satori falls back to its own Latin face.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ImageResponse } from 'next/og';
import type { Lang } from './i18n';

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_TYPE = 'image/png';

// Larch tokens (design/tokens.css): canopy, mist, larch gold, resin text.
const CANOPY = '#1E3B2C';
const MIST = '#F4F6F0';
const GOLD = '#E8B04A';
const MIST_SOFT = 'rgba(244, 246, 240, 0.72)';

const FONTS = path.join(process.cwd(), '..', '..', 'packages', 'fonts', 'node_modules');

type Font = { name: string; data: ArrayBuffer; weight: 600; style: 'normal' };

async function font(name: string, rel: string): Promise<Font | null> {
  try {
    const buf = await readFile(path.join(FONTS, rel));
    return { name, data: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer, weight: 600, style: 'normal' };
  } catch {
    return null;
  }
}

async function fonts(lang: Lang): Promise<Font[]> {
  const list = [await font('Fira Sans', '@fontsource/fira-sans/files/fira-sans-latin-600-normal.woff')];
  if (lang === 'ko') list.push(await font('Pretendard', 'pretendard/dist/public/static/Pretendard-SemiBold.otf'));
  return list.filter((f): f is Font => !!f);
}

export interface OgCardProps {
  lang: Lang;
  kicker: string;
  title: string;
  /** The newest period or the dates, under the title. */
  foot: string;
}

/** The card as a Response, for an opengraph-image route's default export. */
export async function ogImage(p: OgCardProps): Promise<ImageResponse> {
  const family = p.lang === 'ko' ? 'Pretendard, "Fira Sans"' : '"Fira Sans"';
  const long = p.title.length > 70;
  return new ImageResponse(
    (
      <div style={{
        width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
        padding: '64px 72px', background: CANOPY, color: MIST, fontFamily: family, fontWeight: 600,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ width: 22, height: 22, background: GOLD, transform: 'rotate(45deg)' }} />
          <div style={{ fontSize: 30, letterSpacing: p.lang === 'ko' ? 0 : 1 }}>trade-flow</div>
          <div style={{ fontSize: 24, color: MIST_SOFT }}>·</div>
          <div style={{ fontSize: 24, color: MIST_SOFT, textTransform: p.lang === 'ko' ? 'none' : 'uppercase', letterSpacing: p.lang === 'ko' ? 0 : 2 }}>{p.kicker}</div>
        </div>
        <div style={{ display: 'flex', fontSize: long ? 52 : 62, lineHeight: 1.18, letterSpacing: p.lang === 'ko' ? -1 : -0.5, wordBreak: 'keep-all' }}>{p.title}</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', fontSize: 26, color: MIST_SOFT }}>
          <div style={{ display: 'flex' }}>{p.foot}</div>
          <div style={{ display: 'flex' }}>trade-flow.datasteg.com</div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts: await fonts(p.lang) },
  );
}
