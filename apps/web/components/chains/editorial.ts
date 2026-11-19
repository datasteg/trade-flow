// The editor's words for each chain: the title that states the finding, the dek, and the reading (Insight). Titles
// are fixed text, checked against the numbers of the year in `year` (≤ 90 / 40 characters, no colon subtitles) and
// shown with that year (titleWithYear); deks and readings take their numbers from the data through `Facts`, so they
// always match the tables.
// Readings follow docs/PRODUCT-CHAINS.html; Korean in 해라체.
import { josa, type Lang } from '@/lib/i18n';
import { fmtHHI, fmtShare, fmtUSD, fmtUV } from './model';
import type { ChainFile, MetaNode } from './types';

/** What a ranked Asia, n.e.s. (Comtrade partner 490, meta.nodes[].nes) stands for, after its name. */
const NES_GLOSS = { en: ' (most importers’ records of Taiwan)', ko: ' (대부분 수입국 통계상 대만)' } as const;

/** Numbers from one chain file, formatted for one language. Years default to the latest complete year. */
export class Facts {
  constructor(private chain: ChainFile, private nodes: MetaNode[], readonly lang: Lang, readonly y: number) {}

  private stage(key: string, year = this.y) {
    const s = this.chain.stages.find((x) => x.key === key);
    const v = s?.years[String(year)];
    if (!v) throw new Error(`editorial: no ${this.chain.id}:${key} in ${year}`);
    return v;
  }

  private node(iso: string): number {
    const i = this.nodes.findIndex((n) => n.id === iso);
    if (i < 0) throw new Error(`editorial: no economy ${iso}`);
    return i;
  }

  /** The economy's short name in the page language. */
  name(iso: string): string {
    const n = this.nodes[this.node(iso)];
    return this.lang === 'ko' ? n.ko : n.en;
  }

  /** Its share of world exports (it must be among the top five). */
  xs(key: string, iso: string, year = this.y): string {
    const v = this.stage(key, year);
    const i = this.node(iso);
    const hit = v.top_exporters.find(([n]) => n === i);
    if (hit) return fmtShare(hit[1], this.lang);
    throw new Error(`editorial: ${iso} not among the top exporters of ${key} in ${year}`);
  }

  /** Its share of world imports (it must be among the top five). */
  ms(key: string, iso: string, year = this.y): string {
    const v = this.stage(key, year);
    const i = this.node(iso);
    const hit = v.top_importers.find(([n]) => n === i);
    if (hit) return fmtShare(hit[1], this.lang);
    throw new Error(`editorial: ${iso} not among the top importers of ${key} in ${year}`);
  }

  /** The economy at a rank (1–5) among the exporters (side x) or importers (side m): ISO3, name, share. Text that
   *  names the leaders of a stage takes them from here, so it names whichever economies lead. */
  rank(key: string, side: 'x' | 'm', r = 1, year = this.y): { iso: string; name: string; share: string } {
    const v = this.stage(key, year);
    const row = (side === 'x' ? v.top_exporters : v.top_importers)[r - 1];
    if (!row) throw new Error(`editorial: no ${side} rank ${r} for ${key} in ${year}`);
    const n = this.nodes[row[0]];
    const name = (this.lang === 'ko' ? n.ko : n.en) + (n.nes ? NES_GLOSS[this.lang] : '');
    return { iso: n.id, name, share: fmtShare(row[1], this.lang) };
  }

  /** The share of an exporter's exports that go to one importer (flow share ÷ exporter share). */
  toShare(key: string, from: string, to: string, year = this.y): string {
    const v = this.stage(key, year);
    const a = this.node(from), b = this.node(to);
    const f = v.flows.find(([s, t]) => s === a && t === b);
    const x = v.top_exporters.find(([n]) => n === a);
    if (!f || !x) throw new Error(`editorial: no ${from}→${to} in ${key}`);
    return fmtShare(f[2] / x[1], this.lang);
  }

  /** Money in running text: Korean rounds to the whole 억 ("47억 달러", not "46억 5,700만 달러"). */
  private usd(v: number): string {
    return fmtUSD(this.lang === 'ko' && Math.abs(v) >= 1e8 ? Math.round(v / 1e8) * 1e8 : v, this.lang);
  }

  /** World trade. */
  w(key: string, year = this.y): string {
    return this.usd(this.stage(key, year).world);
  }

  /** World trade in year a over year b, "3.8". */
  times(key: string, a: number, b: number): string {
    return (this.stage(key, a).world / this.stage(key, b).world).toFixed(1);
  }

  uv(key: string, year = this.y): string {
    return fmtUV(this.stage(key, year).usd_per_kg, this.lang);
  }

  hhi(key: string, year = this.y, digits = 2): string {
    const h = this.stage(key, year).hhi;
    return digits === 2 ? fmtHHI(h) : (h ?? 0).toFixed(digits);
  }

  /** Share of the stage's value measured from exporters' records. */
  exporterMeasured(key: string, year = this.y): string {
    return fmtShare(1 - (this.stage(key, year).importer_reported ?? 1), this.lang);
  }
}

type Text = (f: Facts) => string;
export interface ChainEditorial {
  /** The year the fixed title was checked against; shown beside the title (titleWithYear) so it cannot go stale unseen. */
  year: number;
  title: { en: string; ko: string };
  dek: { en: Text; ko: Text };
  insight: { en: Text; ko: Text };
}


export const EDITORIAL: Record<string, ChainEditorial> = {
  batteries: {
    year: 2024,
    title: { en: 'China ships three-fifths of lithium-ion cells and three-quarters of lithium hydroxide', ko: '리튬이온 셀의 5분의 3, 수산화리튬의 4분의 3은 중국산' },
    dek: {
      en: (f) => { const a = f.rank('cathode', 'x', 1), b = f.rank('cathode', 'x', 2); return `In ${f.y} China shipped ${f.xs('cells', 'CHN')} of the world’s lithium-ion cells and ${f.xs('li_hydroxide', 'CHN')} of its lithium hydroxide, the chain’s chokepoint, while ${a.name} (${a.share}) and ${b.name} (${b.share}) led the exports of cathode material.`; },
      ko: (f) => { const a = f.rank('cathode', 'x', 1), b = f.rank('cathode', 'x', 2); return `${f.y}년 중국은 세계 리튬이온 셀 수출의 ${f.xs('cells', 'CHN')}, 이 사슬의 병목인 수산화리튬 수출의 ${josa(f.xs('li_hydroxide', 'CHN'), '을')} 차지했습니다. 양극재 수출은 ${a.name}(${a.share})${josa(a.name, '과', '와').slice(a.name.length)} ${b.name}(${b.share})${josa(b.name, '이', '가').slice(b.name.length)} 이끌었습니다.`; },
    },
    insight: {
      en: (f) => { const a = f.rank('li_hydroxide', 'm', 1), b = f.rank('li_hydroxide', 'm', 2); return `Lithium hydroxide is the narrowest point of the chain: one exporter ships ${f.xs('li_hydroxide', 'CHN')} of it (HHI ${f.hhi('li_hydroxide')}), and two buyers, ${a.name} (${a.share}) and ${b.name} (${b.share}), take most of what is traded. Cells are counted where they are made, not by who owns the plant: Poland (${f.xs('cells', 'POL')}) and Hungary (${f.xs('cells', 'HUN')}) are among the five largest exporters.`; },
      ko: (f) => { const a = f.rank('li_hydroxide', 'm', 1), b = f.rank('li_hydroxide', 'm', 2); return `수산화리튬은 이 사슬에서 가장 좁은 곳입니다. 한 수출국이 세계 수출의 ${josa(f.xs('li_hydroxide', 'CHN'), '을')} 차지하고(HHI ${f.hhi('li_hydroxide')}), 두 구매국 ${a.name}(${a.share})${josa(a.name, '과', '와').slice(a.name.length)} ${b.name}(${b.share})${josa(b.name, '이', '가').slice(b.name.length)} 교역량 대부분을 수입합니다. 셀은 공장의 소유주가 아니라 생산한 곳에서 집계합니다. 폴란드(${f.xs('cells', 'POL')})와 헝가리(${f.xs('cells', 'HUN')})가 셀 수출 상위 5위 안에 들었습니다.`; },
    },
  },
  semiconductors: {
    year: 2024,
    title: { en: 'China ships two-thirds of phones; Asia, not elsewhere specified leads chip exports', ko: '휴대전화 수출의 3분의 2는 중국이 차지하고, 반도체 수출은 \'기타 아시아\'가 1위입니다.' },
    dek: {
      en: (f) => { const [a, b, c] = [1, 2, 3].map((r) => f.rank('ics', 'x', r)); return `In ${f.y} ${a.name} (${a.share}), ${b.name} (${b.share}) and ${c.name} (${c.share}) led the ${f.w('ics')} of trade in integrated circuits, and China shipped ${f.xs('phones', 'CHN')} of the world’s smartphones, the chain’s most concentrated stage.`; },
      ko: (f) => { const [a, b, c] = [1, 2, 3].map((r) => f.rank('ics', 'x', r)); return `${f.y}년 집적회로 교역 ${josa(f.w('ics'), '은')} ${a.name}(${a.share}), ${b.name}(${b.share}), ${c.name}(${c.share})${josa(c.name, '이', '가').slice(c.name.length)} 이끌었습니다. 이 사슬에서 가장 집중된 단계인 스마트폰은 중국이 세계 수출의 ${josa(f.xs('phones', 'CHN'), '을')} 차지했습니다.`; },
    },
    insight: {
      en: (f) => { const b = f.rank('chip_tools', 'm', 2), c = f.rank('chip_tools', 'm', 3), pr = f.rank('photoresist', 'x', 1); return `Chip trade counts many chips more than once: a chip made in one economy, packaged in a second and mounted on a board in a third crosses a border under 8542 each time. Upstream, machines matter more than materials: China buys ${f.ms('chip_tools', 'CHN')} of the world’s traded chip-making equipment, ${b.name} ${b.share} and ${c.name} ${c.share}. The narrowest input is a chemical: ${pr.name} ships ${pr.share} of the world’s photoresists.`; },
      ko: (f) => { const b = f.rank('chip_tools', 'm', 2), c = f.rank('chip_tools', 'm', 3), pr = f.rank('photoresist', 'x', 1); return `칩 교역에서는 같은 칩이 여러 번 집계됩니다. 한 경제에서 만든 칩을 다른 경제에서 패키징하고 또 다른 경제에서 기판에 실장할 수 있습니다. 칩은 그때마다 8542로 국경을 넘습니다. 상류에서는 소재보다 장비가 중요합니다. 세계 반도체 제조장비 수입의 ${josa(f.ms('chip_tools', 'CHN'), '을')} 중국이, ${josa(b.share, '을')} ${b.name}이, ${josa(c.share, '을')} ${josa(c.name, '이', '가')}이 수입합니다. 가장 좁은 투입재는 화학제품입니다. 세계 포토레지스트 수출의 ${josa(pr.share, '을')} ${josa(pr.name, '이', '가')}이 차지합니다.`; },
    },
  },
  solar: {
    year: 2024,
    title: { en: 'China ships most solar modules, Germany and the US most polysilicon', ko: '모듈은 중국이, 폴리실리콘은 독일과 미국이' },
    dek: {
      en: (f) => `In ${f.y} China shipped ${f.xs('pv_modules', 'CHN')} of solar modules and ${f.xs('pv_cells', 'CHN')} of solar cells, while Germany (${f.xs('polysilicon', 'DEU')}) and the United States (${f.xs('polysilicon', 'USA')}) led the exports of polysilicon.`,
      ko: (f) => `${f.y}년 중국은 태양광 모듈 수출의 ${f.xs('pv_modules', 'CHN')}, 셀 수출의 ${josa(f.xs('pv_cells', 'CHN'), '을')} 차지했습니다. 폴리실리콘 수출은 독일(${f.xs('polysilicon', 'DEU')})과 미국(${f.xs('polysilicon', 'USA')})이 이끌었습니다.`,
    },
    insight: {
      en: (f) => `Polysilicon is the blind spot of this chain: China makes most of the world’s polysilicon and turns it into wafers at home, so trade shows other makers’ surplus. Module trade fell from ${f.w('pv_modules', 2023)} in 2023 to ${f.w('pv_modules')} in ${f.y} while the unit value fell from ${f.uv('pv_modules', 2023)} to ${f.uv('pv_modules')}.`,
      ko: (f) => `폴리실리콘은 이 사슬의 사각지대입니다. 중국은 세계 폴리실리콘 대부분을 생산해 국내에서 웨이퍼로 가공합니다. 따라서 교역 통계에는 다른 생산국의 잉여 물량만 집계됩니다. 모듈 교역은 2023년 ${f.w('pv_modules', 2023)}에서 ${f.y}년 ${f.w('pv_modules')}로 감소했습니다. 단가는 ${f.uv('pv_modules', 2023)}에서 ${f.uv('pv_modules')}로 하락했습니다.`,
    },
  },
  steel: {
    year: 2024,
    title: { en: 'Australia ships half the iron ore, and China’s flat-steel share doubled', ko: '철광석은 호주가 절반, 중국의 판재 점유율은 두 배로' },
    dek: {
      en: (f) => `In ${f.y} Australia shipped ${f.xs('iron_ore', 'AUS')} of the world’s iron ore and China bought ${f.ms('iron_ore', 'CHN')} of all traded ore, while China’s share of flat-steel exports rose from ${f.xs('flat', 'CHN', 2019)} in 2019 to ${f.xs('flat', 'CHN')}.`,
      ko: (f) => `${f.y}년 호주는 세계 철광석 수출의 ${josa(f.xs('iron_ore', 'AUS'), '을')}, 중국은 수입의 ${josa(f.ms('iron_ore', 'CHN'), '을')} 차지했습니다. 중국의 판재 수출 점유율은 2019년 ${f.xs('flat', 'CHN', 2019)}에서 ${josa(f.xs('flat', 'CHN'), '으로')} 상승했습니다.`,
    },
    insight: {
      en: (f) => `Iron ore is the chain’s chokepoint; from there the chain spreads out, and car parts and cars have exporter HHIs below 0.1 (${f.hhi('car_parts')} and ${f.hhi('cars')}). HS has no code for coking coal, so the coal row also holds thermal coal for power plants and is larger than the steel chain’s need.`,
      ko: (f) => `철광석이 이 사슬의 병목입니다. 그 뒤로 사슬은 넓게 퍼집니다. 자동차 부품과 승용차의 수출국 HHI는 0.1에 못 미칩니다(${f.hhi('car_parts')}, ${f.hhi('cars')}). HS에는 코크스용 석탄 코드가 따로 없어 석탄 행에는 발전용 석탄도 들어 있습니다. 따라서 철강 사슬의 실제 수요보다 큽니다.`,
    },
  },
  aluminium: {
    year: 2024,
    title: { en: 'Guinea ships two-thirds of the bauxite, nine-tenths of it to China', ko: '보크사이트는 기니가 3분의 2, 대부분 중국으로' },
    dek: {
      en: (f) => `In ${f.y} Guinea’s share of bauxite exports reached ${f.xs('bauxite', 'GIN')}, up from ${f.xs('bauxite', 'GIN', 2019)} in 2019, and China bought ${f.ms('bauxite', 'CHN')} of all traded bauxite.`,
      ko: (f) => `${f.y}년 기니의 보크사이트 수출 점유율은 2019년 ${f.xs('bauxite', 'GIN', 2019)}에서 ${josa(f.xs('bauxite', 'GIN'), '으로')} 상승했습니다. 교역된 보크사이트의 ${f.ms('bauxite', 'CHN')}는 중국이 수입했습니다.`,
    },
    insight: {
      en: (f) => `China, the largest smelter, is not among the five largest exporters of unwrought aluminium but leads the next stage with ${f.xs('al_semis', 'CHN')} of bars, sheet and foil, so its place shows one stage later than its production.`,
      ko: (f) => `최대 제련국인 중국은 알루미늄 괴 수출 상위 5위에 들지 않지만, 다음 단계인 봉·판·박에서는 ${josa(f.xs('al_semis', 'CHN'), '으로')} 1위입니다. 중국의 자리는 생산보다 한 단계 늦게 나타납니다.`,
    },
  },
  copper: {
    year: 2024,
    title: { en: 'No exporter holds 30% of any stage of the copper chain', ko: '구리 사슬에는 30%를 넘는 수출국이 없다' },
    dek: {
      en: (f) => `In ${f.y} Chile (${f.xs('cu_conc', 'CHL')}) and Peru (${f.xs('cu_conc', 'PER')}) led copper concentrate, DR Congo (${f.xs('cu_cathode', 'COD')}) and Chile (${f.xs('cu_cathode', 'CHL')}) refined cathode, and trade in power transformers grew from ${f.w('transformers', 2019)} in 2019 to ${f.w('transformers')}.`,
      ko: (f) => `${f.y}년 구리 정광은 칠레(${f.xs('cu_conc', 'CHL')})와 페루(${f.xs('cu_conc', 'PER')}), 정제 동은 콩고민주공화국(${f.xs('cu_cathode', 'COD')})과 칠레(${f.xs('cu_cathode', 'CHL')})가 이끌었습니다. 전력 변압기 교역은 2019년 ${f.w('transformers', 2019)}에서 ${josa(f.w('transformers'), '으로')} 늘었습니다.`,
    },
    insight: {
      en: (f) => { const a = f.rank('transformers', 'x', 1), b = f.rank('transformers', 'x', 2); return `No stage of the copper chain passes our concentration threshold, so it has no chokepoint; the concentration is on the buying side, where China takes ${f.ms('cu_conc', 'CHN')} of concentrate imports. Downstream, ${a.name} (${a.share}) and ${b.name} (${b.share}) lead the exports of power transformers, and the United States buys ${f.ms('transformers', 'USA')} of them.`; },
      ko: (f) => { const a = f.rank('transformers', 'x', 1), b = f.rank('transformers', 'x', 2); return `구리 사슬에는 이 사이트의 집중도 기준을 넘는 단계가 없어 병목이 없습니다. 집중된 쪽은 수요입니다. 중국이 구리 정광 수입의 ${josa(f.ms('cu_conc', 'CHN'), '을')} 차지합니다. 하류의 전력 변압기 수출은 ${a.name}(${a.share})${josa(a.name, '과', '와').slice(a.name.length)} ${b.name}(${b.share})${josa(b.name, '이', '가').slice(b.name.length)} 이끕니다. 미국이 변압기 수입의 ${josa(f.ms('transformers', 'USA'), '을')} 차지합니다.`; },
    },
  },
  magnets: {
    year: 2024,
    title: { en: 'China ships nearly two-thirds of the world’s permanent magnets', ko: '영구자석 수출의 3분의 2 가까이가 중국산' },
    dek: {
      en: (f) => `In ${f.y} China’s share of permanent-magnet exports rose to ${f.xs('magnets', 'CHN')} from ${f.xs('magnets', 'CHN', 2019)} in 2019, and Germany (${f.ms('magnets', 'DEU')}), Japan (${f.ms('magnets', 'JPN')}) and the United States (${f.ms('magnets', 'USA')}) bought the most.`,
      ko: (f) => `${f.y}년 중국의 영구자석 수출 점유율은 2019년 ${f.xs('magnets', 'CHN', 2019)}에서 ${josa(f.xs('magnets', 'CHN'), '으로')} 상승했습니다. 최대 수입국은 독일(${f.ms('magnets', 'DEU')}), 일본(${f.ms('magnets', 'JPN')}), 미국(${f.ms('magnets', 'USA')})이었습니다.`,
    },
    insight: {
      en: (f) => `The first stage is the weakest link of this chain’s data: rare-earth ore has no code of its own, and the residual 2530.90 it shares is now mostly lithium concentrate, so the ore row describes lithium more than rare earths. Myanmar (${f.xs('ree_compounds', 'MMR')}) and Laos (${f.xs('ree_compounds', 'LAO')}) now sit beside China (${f.xs('ree_compounds', 'CHN')}) as exporters of rare-earth compounds, and China takes ${f.ms('ree_compounds', 'CHN')} of compound imports.`,
      ko: (f) => `이 사슬의 자료에서 가장 약한 고리는 첫 단계입니다. 희토류 광석은 고유 코드가 없고, 함께 쓰는 잔여 코드 2530.90은 이제 대부분 리튬 정광입니다. 따라서 광석 행은 희토류보다 리튬을 주로 나타냅니다. 희토류 화합물 수출에서는 미얀마(${f.xs('ree_compounds', 'MMR')})와 라오스(${f.xs('ree_compounds', 'LAO')})가 중국(${f.xs('ree_compounds', 'CHN')})과 함께 주요 수출국이 됐습니다. 화합물 수입의 ${josa(f.ms('ree_compounds', 'CHN'), '은')} 중국이 차지합니다.`,
    },
  },
  plastics: {
    year: 2024,
    title: { en: 'No exporter holds more than 26% of any stage of the plastics chain', ko: '플라스틱 사슬에는 수출 점유율 26%를 넘는 수출국이 없다' },
    dek: {
      en: (f) => { const [o, p, r] = ['olefins', 'polymers', 'synth_rubber'].map((k) => f.rank(k, 'x', 1)); return `In ${f.y} the largest exporters were ${o.name} in olefins (${o.share}), ${p.name} in polymers (${p.share}) and ${r.name} in synthetic rubber (${r.share}), and China bought ${f.ms('olefins', 'CHN')} of traded olefins.`; },
      ko: (f) => { const [o, p, r] = ['olefins', 'polymers', 'synth_rubber'].map((k) => f.rank(k, 'x', 1)); return `${f.y}년 최대 수출국은 올레핀 ${o.name}(${o.share}), 폴리머 ${p.name}(${p.share}), 합성고무 ${r.name}(${r.share})${josa(r.name, '이었다', '였다').slice(r.name.length)}. 교역된 올레핀의 ${josa(f.ms('olefins', 'CHN'), '은')} 중국이 수입했습니다.`; },
    },
    insight: {
      en: (f) => { const x = f.rank('naphtha', 'x', 1), m = f.rank('naphtha', 'm', 1); return `Naphtha has no six-digit code of its own; it shares 2710.12 with motor gasoline, so the S2 row mixes feedstock and fuel.${x.iso === m.iso ? ` Its largest exporter, ${x.name} (${x.share}), is also its largest importer (${m.share}).` : ''}`; },
      ko: (f) => { const x = f.rank('naphtha', 'x', 1), m = f.rank('naphtha', 'm', 1); return `나프타는 고유한 6단위 코드가 없어 휘발유와 2710.12를 함께 씁니다. 따라서 2단계 행에는 원료와 연료가 섞여 있습니다.${x.iso === m.iso ? ` 최대 수출국 ${x.name}(${x.share})${josa(x.name, '은', '는').slice(x.name.length)} 최대 수입국(${m.share})이기도 하다.` : ''}`; },
    },
  },
  textiles: {
    year: 2024,
    title: { en: 'China ships more than half the world’s fabric, up from 44%', ko: '세계 원단 수출의 절반 이상이 중국산' },
    dek: {
      en: (f) => `In ${f.y} China shipped ${f.xs('fabric', 'CHN')} of the world’s fabric, up from ${f.xs('fabric', 'CHN', 2019)} in 2019, and the largest buyers were the cut-and-sew economies: Vietnam (${f.ms('fabric', 'VNM')}), Bangladesh (${f.ms('fabric', 'BGD')}) and Cambodia (${f.ms('fabric', 'KHM')}).`,
      ko: (f) => `${f.y}년 중국은 세계 원단 수출의 ${josa(f.xs('fabric', 'CHN'), '을')} 차지해 2019년(${f.xs('fabric', 'CHN', 2019)})보다 상승했습니다. 최대 수입국은 봉제 경제권인 베트남(${f.ms('fabric', 'VNM')}), 방글라데시(${f.ms('fabric', 'BGD')}), 캄보디아(${f.ms('fabric', 'KHM')})였습니다.`,
    },
    insight: {
      en: (f) => `Clothing itself is spread out (China ${f.xs('apparel', 'CHN')}, Bangladesh ${f.xs('apparel', 'BGD')}, Vietnam ${f.xs('apparel', 'VNM')}), so the chain narrows at the fabric. Upstream, Brazil (${f.xs('cotton', 'BRA')}) has overtaken the United States (${f.xs('cotton', 'USA')}) in raw cotton, from ${f.xs('cotton', 'BRA', 2019)} in 2019. Several large buyers do not report every year, so ${f.exporterMeasured('fabric')} of fabric trade is measured from exporters’ records.`,
      ko: (f) => `의류 자체는 분산되어 있습니다(중국 ${f.xs('apparel', 'CHN')}, 방글라데시 ${f.xs('apparel', 'BGD')}, 베트남 ${f.xs('apparel', 'VNM')}). 사슬은 원단 단계에서 좁아집니다. 상류에서는 브라질(${f.xs('cotton', 'BRA')})이 원면 수출에서 미국(${f.xs('cotton', 'USA')})을 앞질렀습니다. 2019년 브라질은 ${f.xs('cotton', 'BRA', 2019)}이었습니다. 큰 수입국 몇 곳은 해마다 신고하지는 않습니다. 따라서 원단 교역의 ${josa(f.exporterMeasured('fabric'), '은')} 수출국 신고로 집계합니다.`,
    },
  },
  fertiliser: {
    year: 2024,
    title: { en: 'Canada leads potash, Russia nitrogen and Morocco phosphates', ko: '칼륨은 캐나다, 질소는 러시아, 인산은 모로코' },
    dek: {
      en: (f) => `In ${f.y} Canada shipped ${f.xs('potash', 'CAN')} of potash, Russia ${f.xs('nitrogen', 'RUS')} of nitrogen fertilisers and Morocco ${f.xs('phosphates', 'MAR')} of phosphate fertilisers, and China bought ${f.ms('crops', 'CHN')} of the traded wheat, maize and soybeans.`,
      ko: (f) => `${f.y}년 칼륨 비료 수출의 ${josa(f.xs('potash', 'CAN'), '은')} 캐나다, 질소 비료의 ${josa(f.xs('nitrogen', 'RUS'), '은')} 러시아, 인산 비료의 ${josa(f.xs('phosphates', 'MAR'), '은')} 모로코가 차지했습니다. 교역된 밀·옥수수·대두의 ${josa(f.ms('crops', 'CHN'), '은')} 중국이 수입했습니다.`,
    },
    insight: {
      en: (f) => `Each nutrient has its own geography, so the chain has no chokepoint; potash comes closest, with an HHI of ${f.hhi('potash', f.y, 4)}, just under 0.25. Belarus fell from ${f.xs('potash', 'BLR', 2019)} of potash exports in 2019 to ${f.xs('potash', 'BLR')} after the sanctions of 2021 and 2022, while Russia rose from ${f.xs('potash', 'RUS', 2019)} to ${f.xs('potash', 'RUS')}.`,
      ko: (f) => `영양소마다 지리가 달라 이 사슬에는 병목이 없습니다. 병목이 가장 가까운 영양소는 칼륨입니다. 칼륨의 HHI ${f.hhi('potash', f.y, 4)}은 기준선 0.25에 조금 못 미칩니다. 2021년과 2022년의 제재 이후 벨라루스의 칼륨 수출 점유율은 2019년 ${f.xs('potash', 'BLR', 2019)}에서 ${josa(f.xs('potash', 'BLR'), '으로')} 하락했습니다. 러시아는 ${f.xs('potash', 'RUS', 2019)}에서 ${josa(f.xs('potash', 'RUS'), '으로')} 상승했습니다.`,
    },
  },
};

/** The title with the year its numbers were checked against: "… (2024)" / "…(2024년)". */
export function titleWithYear(ed: ChainEditorial, lang: Lang): string {
  return lang === 'ko' ? `${ed.title.ko}(${ed.year}년)` : `${ed.title.en} (${ed.year})`;
}

/** The index title: how many chains have China as the top exporter of their chokepoint stage. */
const WORDS_EN = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function indexTitle(lang: Lang, chinaChokepoints: number, chains: number): string {
  if (lang === 'ko') return `${chains}개 사슬 가운데 ${chinaChokepoints}개 사슬의 병목은 중국이 쥐고 있습니다`;
  return `China leads the chokepoint stage of ${WORDS_EN[chinaChokepoints] ?? chinaChokepoints} of the ${WORDS_EN[chains] ?? chains} chains`;
}
