import type { StringTable } from './types';

// Strings every page shares: the shell (skip link, footer, metadata) and the section names. Use as t(lang, 'common.<key>').
// The Masthead's own labels (Explorer, Chains …) live in @larch/ui (sectionLabel); repeat them here only if a page
// needs different wording.
export const common = {
  siteName: { en: 'trade-flow', ko: 'trade-flow' },
  description: {
    en: 'The world trade network and product chains, from ore to product, traced through UN Comtrade customs records.',
    ko: 'UN Comtrade 통관자료로 본 세계 교역 네트워크와 광석에서 완제품까지의 공급망 사슬.',
  },
  skip: { en: 'Skip to content', ko: '본문 바로가기' },
  'footer.method': { en: 'Method', ko: '방법론' },
  'footer.articles': { en: 'articles.datasteg.com', ko: 'articles.datasteg.com' },
  'footer.source': {
    en: 'Data: UN Comtrade (United Nations Statistics Division)',
    ko: '자료: UN Comtrade(유엔 통계처)',
  },
  'nav.home': { en: 'Home', ko: '홈' },
  'nav.explore': { en: 'Explorer', ko: '탐색' },
  'nav.exploreMonthly': { en: 'Monthly', ko: '월별' },
  'nav.chains': { en: 'Chains', ko: '공급망 사슬' },
  'nav.events': { en: 'Events', ko: '경제 사건' },
  'nav.cases': { en: 'Cases', ko: '사례 연구' },
  'nav.method': { en: 'Method', ko: '방법론' },
  'nav.checks': { en: 'Checks', ko: '검증' },
  // the family strip's context links (components/Family.tsx): the site and the object, never "here"
  'family.in': { en: '{name} in {site}', ko: '{site}의 {name}' },
  'family.flowIn': { en: '{a} → {b} in {site}', ko: '{site}의 {a} → {b}' },
  'family.dollarIn': { en: 'The dollar channel in {site}', ko: '{site}의 달러 경로' },
  'notFound.title': { en: 'Page not found', ko: '페이지를 찾을 수 없습니다' },
  'notFound.body': { en: 'The address may be mistyped, or the page has moved.', ko: '주소가 잘못되었거나 페이지가 옮겨졌을 수 있습니다.' },
  'notFound.home': { en: 'Go to the home page', ko: '홈으로 가기' },
} satisfies StringTable;
