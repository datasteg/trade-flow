import type { Lang } from './format';

// The components' own words, in both editions (glossary: design book 06-Bilingual). The site's strings live in
// apps/web/lib/strings/; these are only what a component writes by itself.
const S = {
  wordmark: { en: 'trade-flow', ko: 'trade-flow' }, // stays in Latin letters on Korean pages
  'nav.label': { en: 'Main', ko: '주 메뉴' },
  'nav.explore': { en: 'Explorer', ko: '탐색' },
  'nav.explore-monthly': { en: 'Monthly', ko: '월별' },
  'nav.chains': { en: 'Chains', ko: '공급망 사슬' },
  'nav.events': { en: 'Events', ko: '경제 사건' },
  'nav.cases': { en: 'Cases', ko: '사례 연구' },
  'nav.method': { en: 'Method', ko: '방법론' },
  'lang.label': { en: 'Language', ko: '언어' },
  'lang.ko': { en: 'Korean', ko: '한국어' },
  'lang.en': { en: 'English', ko: '영어' },
  'theme.toDark': { en: 'Switch to dark theme', ko: '다크 모드로 전환' },
  'theme.toLight': { en: 'Switch to light theme', ko: '라이트 모드로 전환' },
  'footer.source': { en: 'Data: UN Comtrade (United Nations Statistics Division)', ko: '자료: UN Comtrade(유엔 통계처)' },
  'insight.label': { en: 'Our reading', ko: '편집자 해석' },
  'hs.residual': { en: 'Residual code: holds other products too', ko: '잔여 코드(다른 품목 포함 코드)' },
  'tag.remove': { en: 'Remove {label}', ko: '{label} 빼기' },
  'share.others': { en: 'Others', ko: '기타' },
  'sign.up': { en: 'Upstream', ko: '상류' },
  'sign.down': { en: 'Downstream', ko: '하류' },
} satisfies Record<string, Record<Lang, string>>;

export type UiKey = keyof typeof S;

export function ui(lang: Lang, key: UiKey, vars?: Record<string, string | number>): string {
  const s = S[key][lang];
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : s;
}

/** A chain stage: "S3" / "3단계". */
export function stageLabel(lang: Lang, n: number): string {
  return lang === 'ko' ? `${n}단계` : `S${n}`;
}

export type Section = 'explore' | 'explore-monthly' | 'chains' | 'events' | 'cases' | 'method';
export const SECTIONS: readonly Section[] = ['explore', 'explore-monthly', 'chains', 'events', 'cases', 'method'];

/** The Masthead label of a section ("Chains" / "공급망 사슬"), for page titles that repeat it. */
export function sectionLabel(lang: Lang, s: Section): string {
  return ui(lang, `nav.${s}`);
}
