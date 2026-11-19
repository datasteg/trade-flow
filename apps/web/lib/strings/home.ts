import type { StringTable } from './types';

// The home page (/[lang]): two blocks. The world trade network of the last complete year, drawn on the server, as the
// block that opens the explorer; and the ten chains as blocks that open their pages. Use as t(lang, 'home.<key>', vars).
// Korean prose in 해라체.
export const home = {
  'meta.title': { en: 'The world trade network, product by product', ko: '품목별로 보는 세계 교역 네트워크' },
  dek: {
    en: 'The world’s trade between economies, for any product and year, from UN Comtrade customs records, with ten product chains traced from ore to product.',
    ko: 'UN Comtrade 통관자료로 품목·연도별 경제권 간 세계 교역을 집계했습니다. 광석에서 완제품까지 열 개 공급망 사슬도 따라갑니다.',
  },

  // The network block (the explorer's first view, drawn on the server; the plate carries the words)
  'hero.kicker': { en: 'Explorer', ko: '탐색' },
  'hero.title': { en: 'The world trade network, {year}', ko: '{year}년 세계 교역 네트워크' },
  'hero.facts': { en: '{world} of trade · {n} economies · {flows} flows', ko: '교역 {world} · {n}개국 · 교역 흐름 {flows}개' },
  'hero.open': { en: 'Open the explorer', ko: '탐색 화면 열기' },
  'hero.alt': {
    en: 'The world trade network of {year}, painted: each cluster of dabs is an economy, sized by trade and coloured by region; each brushstroke is one of the largest flows. Placed by trade ties, not geography',
    ko: '{year}년 세계 교역 네트워크를 그린 그림입니다. 물감 점의 무리는 경제권(크기는 교역액, 색은 지역)이고, 붓질은 최대 교역 흐름입니다. 위치는 지리가 아니라 교역 관계로 정했습니다.',
  },
  // the painting's hover label and the idle caption of a notable flow
  'hero.trade': { en: '{v} of trade', ko: '교역 {v}' },
  'hero.flow': { en: '{a} → {b} · {v}', ko: '{a} → {b} · {v}' },

  // The ten chains as blocks
  'chains.h': { en: 'Ten chains, from ore to product', ko: '광석에서 완제품까지, 열 개의 공급망 사슬' },
  'chains.all': { en: 'All chains', ko: '모든 사슬 보기' },
  // a rung of the ladder holds one or more stages (products), as the chain index counts them
  'chains.stages': { en: '{n} rungs · {k} stages', ko: '{n}개 층위 · {k}개 단계' },
  'chains.ladder': { en: 'A ladder of {n} rungs: {names}', ko: '{n}개 층위: {names}' },
  'chains.choke': { en: 'Chokepoint: {name}', ko: '병목: {name}' },

  source: {
    en: 'Source: UN Comtrade, Final data, {year}; mirror rule. The network: all goods, the largest economies as clusters of dabs sized by exports plus imports and coloured by region, the largest flows as brushstrokes; economies are placed by their trade ties, not by geography. The chains: HS6 stages on each chain’s own ladder; the ringed rung is the chokepoint (exporter HHI above 0.25).',
    ko: '자료: UN Comtrade 확정치, {year}년, 미러 규칙. 네트워크는 전체 상품 기준입니다. 최대 경제권은 물감 점의 무리로 그렸습니다(크기는 수출입 합계, 색은 지역). 최대 교역 흐름은 붓질로 그렸습니다. 경제권의 위치는 지리가 아니라 교역 관계로 정했습니다. 사슬은 HS 6단위 단계를 사슬마다의 사다리에 놓은 것입니다. 고리를 친 층위는 병목(수출국 HHI 0.25 초과)입니다.',
  },
} satisfies StringTable;
