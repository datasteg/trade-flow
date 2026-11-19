// The catalogue views: products, chains (the chain pages, ?focus=ISO3), events and cases (their pages). Shares,
// ranks, HHI and ratios only (core.ts); the pages' prose passes through withoutAmounts (prose.ts).
import { formatDate } from '@/lib/i18n';
import { periodLabel } from '@/components/stories/names';
import { econPlace, hhiBand, HHI_HIGH, uvShown } from '@/components/chains/model';
import type { ChainFile, ChainIndexFile, EconFile } from '@/components/chains/types';
import type { CaseDoc, CasesIndex, EventDoc, EventsIndex, Measured, Movers, PartnerShares } from '@/components/stories/types';
import { readData } from '@/lib/data';
import {
  annualSources, badParam, change, econIndex, econRef, enName, envelope, getMeta, limitParam, pageOf, pct, pctText,
  productName, ratio, sourcesFor, unknownId, ym, type Envelope, type Lang,
} from './core';
import type { Meta } from '@larch/net/core';
import { productBrief } from './trade';
import { withoutAmounts } from './prose';

const bi = (x: { en: string; ko: string } | null | undefined, lang: Lang) => (x ? (lang === 'ko' ? x.ko || x.en : x.en) : null);

/* Products ---------------------------------------------------------------------------------------------------------------- */

const KINDS = ['total', 'chapter', 'basket', 'stage'];

export async function productsView(url: URL, lang: Lang): Promise<Envelope> {
  const meta = await getMeta();
  const kind = url.searchParams.get('kind');
  if (kind && !KINDS.includes(kind)) throw badParam(`kind must be one of ${KINDS.join(', ')}; got "${kind.slice(0, 20)}".`);
  const limit = limitParam(url, 25, 100);
  const cur = url.searchParams.get('cursor');
  const start = cur == null ? 0 : Number(cur);
  if (!Number.isInteger(start) || start < 0) throw badParam('cursor must be the value a previous answer returned.');
  const all = meta.products.filter((p) => !kind || p.kind === kind);
  const page = all.slice(start, start + limit).map((p) => {
    const b = productBrief(meta, p, lang);
    return { id: b.id, kind: b.kind, name: b.name, codes: b.codes, chain: b.chain, stage: b.stage, rung: b.rung, years: b.years, windows: b.windows, page: b.page };
  });
  const next = start + limit < all.length ? String(start + limit) : null;
  const counts = KINDS.map((k) => `${meta.products.filter((p) => p.kind === k).length} ${k === 'total' ? 'total' : `${k}s`}`).join(', ');
  return envelope(meta, 'products', {
    page: pageOf(lang, '/explore'), ...annualSources(meta), cursor: next,
    summary: `trade-flow has ${meta.products.length} products (${counts}): all goods, HS chapters, baskets of HS codes and the stages of ten product chains. ${kind ? `Listed: ${all.length} of kind ${kind}, ` : ''}items ${start + 1}–${start + page.length}${next ? `; pass cursor=${next} for more` : ''}.`,
    data: { count: all.length, kind: kind ?? null, products: page },
    notes: ['A product id is TOTAL, HS:<chapter>, B:<basket> or C:<chain>:<stage>. years: the explorer’s years; windows: the monthly explorer’s 12-month windows (all goods, baskets and chain stages; HS chapters are annual only).'],
  });
}

/* Chains ------------------------------------------------------------------------------------------------------------------- */

const chainIndex = () => readData<ChainIndexFile>('chains/index.json');

async function chainFile(id: string): Promise<{ index: ChainIndexFile; chain: ChainFile }> {
  const index = await chainIndex();
  if (!index.chains.some((c) => c.id === id)) {
    throw unknownId('unknown-chain', 'Unknown chain', `${id.slice(0, 40)} is not a trade-flow chain. Use one of ${index.chains.map((c) => c.id).join(', ')}; GET /v1/trade-flow/chains lists them.`);
  }
  return { index, chain: await readData<ChainFile>(`chains/${id}.json`) };
}

export async function chainsView(lang: Lang): Promise<Envelope> {
  const meta = await getMeta();
  const index = await chainIndex();
  const files = await Promise.all(index.chains.map((c) => readData<ChainFile>(`chains/${c.id}.json`)));
  const chains = index.chains.map((c, k) => {
    const st = (key: string | null | undefined) => files[k].stages.find((s) => s.key === key);
    const ck = st(c.chokepoint);
    const tw = c.two_way ? st(c.two_way.stage) : null;
    return {
      id: c.id, name: bi(c, lang), stages: c.stages, rungs: c.levels.length, year: c.year,
      chokepoint: ck ? { stage: ck.key, name: bi(ck, lang), exporter_hhi: ratio(ck.years[String(c.year)]?.hhi) } : null,
      most_two_way: c.two_way && tw ? { stage: tw.key, name: bi(tw, lang), economy: econRef(meta, c.two_way.i, lang), grubel_lloyd: ratio(c.two_way.gl, 2) } : null,
      page: pageOf(lang, `/chains/${c.id}`),
    };
  });
  const withChoke = chains.filter((c) => c.chokepoint);
  return envelope(meta, 'chains', {
    page: pageOf(lang, '/chains'), ...annualSources(meta),
    summary: `trade-flow follows ${chains.length} product chains from ore to product: ${index.chains.map((c) => c.en).join('; ')}. In ${index.chains[0]?.year ?? meta.complete.A}, ${withChoke.length} have a chokepoint stage (exporter HHI above ${HHI_HIGH}). Source: UN Comtrade, annual data.`,
    data: { chains },
  });
}

export interface ChainArgs { chain: string; economy: string | null; year: string | null; lang: Lang }

export async function chainView(o: ChainArgs): Promise<Envelope> {
  const meta = await getMeta();
  const { chain } = await chainFile(o.chain);
  const lang = o.lang;
  let year = meta.complete.A;
  if (o.year != null) {
    const y = Number(o.year);
    if (!/^\d{4}$/.test(o.year) || !chain.years.includes(y)) throw badParam(`year must be one of the chain's years, ${chain.years[0]} to ${chain.years[chain.years.length - 1]}; got "${o.year.slice(0, 10)}".`);
    year = y;
  }
  const fi = o.economy ? econIndex(meta, o.economy) : null;
  const econ = fi != null ? await readData<EconFile>(`econ/${chain.id}/${year}.json`).catch(() => null) : null;
  const ck = chain.chokepoint[String(year)] ?? null;
  const stages = chain.stages.map((s) => {
    const y = s.years[String(year)];
    const has = !!y && y.world > 0;
    const use = s.use_share?.[chain.id];
    const place = fi != null ? econPlace(econ, s.key, fi) : null;
    return {
      key: s.key, product: s.product, rung: s.stage, name: bi(s, lang), codes: s.codes,
      feeds: s.feeds, role: s.role, residual: s.residual, caveat: bi(s.caveat, lang), traded: has,
      exporter_hhi: has ? ratio(y.hhi) : null, concentration: has ? hhiBand(y.hhi) : null, chokepoint: ck === s.key,
      exporters: has ? y.exporters : null, importer_reported_pct: has ? pct(y.importer_reported) : null,
      unit_value_usd_per_kg: has && uvShown(y) ? ratio(y.usd_per_kg, y.usd_per_kg! < 1 ? 3 : 2) : null,
      top_exporters: has ? y.top_exporters.slice(0, 5).map(([i, v]) => ({ ...econRef(meta, i, lang), share_of_world_pct: pct(v) })) : [],
      top_importers: has ? y.top_importers.slice(0, 5).map(([i, v]) => ({ ...econRef(meta, i, lang), share_of_world_pct: pct(v) })) : [],
      top_flows: has ? y.flows.slice(0, 3).map(([a, b, v]) => ({ exporter: econRef(meta, a, lang).code, importer: econRef(meta, b, lang).code, share_of_stage_pct: pct(v) })) : [],
      use_share: use ? { share_pct: pct(use.share), what: bi(use.what ?? null, lang), source: use.source ?? null, year: use.year ?? null, url: use.url ?? null } : null,
      ...(fi != null ? {
        economy: place ? {
          share_of_world_exports_pct: pct(place.x), export_rank: place.xRank, share_of_world_imports_pct: pct(place.m), import_rank: place.mRank,
          top_supplier: place.ts != null ? { ...econRef(meta, place.ts, lang), share_of_imports_pct: pct(place.tss) } : null,
        } : null,
      } : {}),
    };
  });
  const choke = stages.filter((s) => s.exporter_hhi != null && s.exporter_hhi > HHI_HIGH)
    .sort((a, b) => (b.exporter_hhi ?? 0) - (a.exporter_hhi ?? 0))
    .map((s) => ({ stage: s.key, name: s.name, exporter_hhi: s.exporter_hhi, role: s.role, top_exporter: s.top_exporters[0] ?? null, chain_chokepoint: s.chokepoint }));
  const notes: string[] = [`A chokepoint is a stage whose exporter HHI is above ${HHI_HIGH} (the sum of squared shares of world exports); chain_chokepoint marks the one stage the chain page names for the year.`];
  if (year > meta.complete.A) notes.push(`${year} is partial: fewer than the ten largest traders had filed (the last complete year is ${meta.complete.A}).`);
  if (fi != null && !econ) notes.push(`No economy table for ${year} in this release.`);
  const ckS = stages.find((s) => s.chokepoint);
  const en = (k: string) => chain.stages.find((s) => s.key === k)?.en ?? k;
  const top = ckS?.top_exporters[0];
  const focus = fi != null ? enName(meta, fi) : null;
  const lead = fi != null ? stages.filter((s) => s.economy?.export_rank != null && s.economy.export_rank <= 3).map((s) => `${en(s.key)} (#${s.economy!.export_rank})`) : [];
  const summary = `${chain.en} chain, ${year}: ${stages.length} stages on ${chain.levels.length} rungs. `
    + (ckS ? `Chokepoint: ${en(ckS.key)}, exporter HHI ${ckS.exporter_hhi}${top ? `, ${enName(meta, econIndex(meta, top.code))} ${top.share_of_world_pct}% of world exports` : ''}. ` : 'No chokepoint stage this year. ')
    + (choke.length ? `Stages above HHI ${HHI_HIGH}: ${choke.map((c) => `${en(c.stage)} ${c.exporter_hhi}`).join(', ')}. ` : '')
    + (focus ? (lead.length ? `${focus} is a top-three exporter of ${lead.join(', ')}. ` : `${focus} is not a top-three exporter of any stage. `) : '')
    + 'Source: UN Comtrade, annual data, mirror rule.';
  return envelope(meta, 'chain', {
    period: { freq: 'A', shown: String(year), default: String(meta.complete.A), newest: String(chain.years[chain.years.length - 1]), complete_a: meta.complete.A, partial: year > meta.complete.A },
    page: pageOf(lang, `/chains/${chain.id}${fi != null ? `?focus=${meta.nodes[fi].id}` : ''}`),
    ...annualSources(meta), notes, summary,
    data: {
      chain: { id: chain.id, name: bi(chain, lang) }, year,
      levels: chain.levels.map((l, k) => ({ rung: k + 1, name: bi(l, lang), who: bi(l.who, lang) })),
      economy: fi != null ? econRef(meta, fi, lang) : null,
      chokepoint: ck, chokepoints: choke, stages,
    },
    table: {
      columns: [
        { id: 'rung', label: 'Rung' }, { id: 'key', label: 'Stage' }, { id: 'name', label: 'Name' }, { id: 'exporter_hhi', label: 'Exporter HHI', unit: 'index 0–1' },
        { id: 'top_exporter', label: 'Largest exporter (ISO3)' }, { id: 'top_share', label: 'Its share of world exports', unit: '%' },
      ],
      rows: stages.map((s) => [s.rung, s.key, s.name, s.exporter_hhi, s.top_exporters[0]?.code ?? null, s.top_exporters[0]?.share_of_world_pct ?? null]),
    },
  });
}

/* Events -------------------------------------------------------------------------------------------------------------------- */

const eventsIndex = () => readData<EventsIndex>('events/index.json');

function eventBrief(meta: Meta, e: EventsIndex['events'][number], lang: Lang) {
  return {
    id: e.id, num: e.num, kind: e.kind, title: bi(e.title, lang), dek: withoutAmounts(bi(e.dek, lang)),
    start: e.start, end: e.end, ongoing: e.ongoing,
    products: e.products.map((p) => p.split('|')[0]),
    economies: e.economies,
    page: pageOf(lang, `/events/${e.id}`),
  };
}

export async function eventsView(lang: Lang): Promise<Envelope> {
  const meta = await getMeta();
  const idx = await eventsIndex();
  const events = idx.events.map((e) => eventBrief(meta, e, lang));
  return envelope(meta, 'events', {
    page: pageOf(lang, '/events'), ...sourcesFor(meta, 'M', null),
    summary: `trade-flow reads ${events.length} economic events in the trade data, from ${idx.events[0]?.title.en ?? ''} (${idx.events[0]?.start.slice(0, 4) ?? ''}) to ${idx.events[idx.events.length - 1]?.title.en ?? ''} (${idx.events[idx.events.length - 1]?.start.slice(0, 4) ?? ''}). Each page shows the trade before and after, what changed and what else happened at the time.`,
    data: { events },
  });
}

/** An event's id: 404 when the site has no such page. */
async function eventDoc(id: string): Promise<{ idx: EventsIndex; doc: EventDoc }> {
  const idx = await eventsIndex();
  if (!idx.events.some((e) => e.id === id)) {
    throw unknownId('unknown-event', 'Unknown event', `${id.slice(0, 60)} is not a trade-flow event. GET /v1/trade-flow/events lists the ${idx.events.length} events and their ids.`);
  }
  return { idx, doc: await readData<EventDoc>(`events/${id}.json`) };
}

const periodOf = (t: number) => (t > 9999 ? ym(t) : String(t));

export async function eventView(id: string, lang: Lang): Promise<Envelope> {
  const meta = await getMeta();
  const { idx, doc } = await eventDoc(id);
  const cases = await casesIndex().catch(() => null);
  const brief = eventBrief(meta, idx.events.find((e) => e.id === id)!, lang);
  const v = doc.view;
  const prod = (pid: string) => {
    const p = meta.products.find((x) => x.id === pid.split('|')[0]);
    return { id: pid.split('|')[0], name: p ? productName(p, lang) : pid };
  };
  const movers = doc.measures.filter((m): m is Movers & Measured => m.kind === 'movers').map((m) => {
    const mm = m as unknown as { product: string; base: number; t: number; world_change: number | null; up: [number, number, number][]; down: [number, number, number][] };
    const row = ([i, d, s]: [number, number, number]) => ({ ...econRef(meta, i, lang), change_in_share_pp: pct(d), share_of_world_exports_pct: pct(s) });
    const lens = (m as { lens?: string | null }).lens ?? null;
    return {
      product: prod(mm.product), base: periodOf(mm.base), t: periodOf(mm.t), sums: lens === 'M' ? '3-month sums' : lens === 'L' ? '12-month sums' : lens === 'S' ? 'single months' : 'years',
      base_label: periodLabel(mm.base, 'en', lens as 'L' | 'M' | 'S' | null), t_label: periodLabel(mm.t, 'en', lens as 'L' | 'M' | 'S' | null),
      world_exports_change_pct: change(mm.world_change), gained: mm.up.slice(0, 5).map(row), lost: mm.down.slice(0, 5).map(row),
    };
  });
  const vm = movers.find((m) => m.product.id === v.p.split('|')[0]) ?? null;
  const changes = (doc.series as PartnerShares[]).map((s) => {
    const i = s.t.indexOf(v.t), j = s.t.indexOf(v.base);
    return {
      economy: s.economy, role: s.role, product: prod(s.product).id, at: periodOf(v.t), base: periodOf(v.base),
      change_on_year_pct: i >= 0 ? change(s.yoy[i]) : null, filed: i >= 0 ? !!s.filed[i] : false,
      top_partners: s.series.slice(0, 5).map((x) => ({ code: x.id, share_at_base_pct: j >= 0 ? pct(x.share[j]) : null, share_at_t_pct: i >= 0 ? pct(x.share[i]) : null })),
    };
  });
  const months: number[] = [];
  for (const x of [v.base, v.t]) if (x > 9999) months.push(x);
  const span: [number, number] | null = months.length ? [Math.min(...months) - 100, Math.max(...months)] : null;
  const { sources, notes } = sourcesFor(meta, v.f === 'M' ? 'M' : 'A', span);
  notes.push('Dollar amounts in the page’s text are shown as […] or left out here: the API returns derived records only (shares, ranks, changes); the page has them.');
  const summary = `${doc.title.en} (${formatDate(doc.start, 'en')}${doc.ongoing ? ', ongoing' : doc.end && doc.end !== doc.start ? ` to ${formatDate(doc.end, 'en')}` : ''}). ${withoutAmounts(doc.dek.en)}`
    + (vm?.world_exports_change_pct != null ? ` World exports of ${(meta.products.find((p) => p.id === vm.product.id)?.en ?? vm.product.id).toLowerCase()} changed ${vm.world_exports_change_pct > 0 ? '+' : ''}${vm.world_exports_change_pct}% between ${vm.base_label} and ${vm.t_label}.` : '')
    + ' Source: UN Comtrade and the dated sources the page cites.';
  return envelope(meta, 'event', {
    period: { freq: v.f, shown: periodOf(v.t), base: periodOf(v.base), lens: v.lens ?? null },
    page: brief.page, sources, notes, summary,
    data: {
      ...brief,
      watch: withoutAmounts(bi(doc.watch, lang)),
      view: { freq: v.f, product: prod(v.p), base: periodOf(v.base), t: periodOf(v.t), lens: v.lens ?? null },
      timeline: doc.timeline.map((x) => ({ date: x.date, text: withoutAmounts(bi(x, lang)), source: x.source ?? null })),
      reading: doc.reading ? {
        window: withoutAmounts(bi(doc.reading.window ?? null, lang)),
        items: doc.reading.items.map((x) => ({ kind: x.kind ?? null, numbers: withoutAmounts(bi(x.number, lang)), text: withoutAmounts(bi(x, lang)), sources: x.sources ?? [] })),
      } : null,
      movers, changes,
      cases: (cases?.cases ?? []).filter((c) => c.events.includes(doc.num)).map((c) => ({ id: c.id, title: bi(c.title, lang), page: pageOf(lang, `/cases/${c.id}`) })),
      sources: (doc.sources as unknown as { n: number; title: string; publisher: string; date: string; url: string }[]).map((x) => ({ n: x.n, title: x.title, publisher: x.publisher, date: x.date, url: x.url })),
    },
  });
}

/* Cases ------------------------------------------------------------------------------------------------------------------------ */

const casesIndex = () => readData<CasesIndex>('cases/index.json');

export async function casesView(lang: Lang): Promise<Envelope> {
  const meta = await getMeta();
  const [idx, ev] = await Promise.all([casesIndex(), eventsIndex().catch(() => null)]);
  const evId = (num: string) => ev?.events.find((e) => e.num === num)?.id ?? null;
  const cases = idx.cases.map((c) => ({
    id: c.id, num: c.num, title: bi(c.title, lang), question: bi(c.question, lang), papers: c.papers,
    events: c.events.map(evId).filter((x): x is string => !!x), page: pageOf(lang, `/cases/${c.id}`),
  }));
  return envelope(meta, 'cases', {
    page: pageOf(lang, '/cases'), ...annualSources(meta),
    summary: `trade-flow has ${cases.length} case studies, each a question from the literature read against the trade network with papers from the jejualps archive (verified quotes), the measures, a first-round scenario and Korea's place: ${idx.cases.map((c) => c.title.en).join('; ')}.`,
    data: { cases, tool: { id: 'supplier_cut', page: pageOf(lang, '/cases/tools/cut-supplier') } },
  });
}

/** A measured result in readable fields (node indices as codes, fractions as percentages); unknown kinds keep only
 *  their kind and label. USD fields (fragility_rank's world column) are dropped. */
function measure(meta: Meta, m: Measured, lang: Lang): Record<string, unknown> {
  const code = (i: unknown) => (typeof i === 'number' ? meta.nodes[i]?.id ?? null : null);
  const label = bi((m.spec as { en: string; ko: string } | undefined) ?? null, lang);
  const x = m as Record<string, unknown>;
  const per = (t: unknown) => (typeof t === 'number' ? periodOf(t) : null);
  switch (m.kind) {
    case 'top_exporters':
      return { kind: m.kind, label, product: x.product, t: per(x.t), rows: ((x.rows as [number, number][]) ?? []).slice(0, 10).map(([i, s]) => ({ code: code(i), share_of_world_exports_pct: pct(s) })), korea_share_pct: pct(x.kor as number), korea_rank: x.kor_rank ?? null };
    case 'korea_exposure':
      return { kind: m.kind, label, product: x.product, t: per(x.t), korea_share_of_world_imports_pct: pct(x.share_of_world_imports as number), top_suppliers: ((x.top_suppliers as [number, number][]) ?? []).map(([i, s]) => ({ code: code(i), share_of_korea_imports_pct: pct(s) })), supplier: x.supplier ?? null, supplier_share_pct: pct(x.supplier_share as number) };
    case 'world_change':
      return { kind: m.kind, label, product: x.product, partner: x.partner ?? null, values: ((x.values as { t: number; against: number; change: number }[]) ?? []).map((v) => ({ t: per(v.t), against: per(v.against), change_pct: change(v.change) })) };
    case 'partner_split':
      return { kind: m.kind, label, product: x.product, partner: x.partner ?? null, values: ((x.values as { t: number; against: number; from: number; others: number }[]) ?? []).map((v) => ({ t: per(v.t), against: per(v.against), from_partner_pp: pct(v.from), from_others_pp: pct(v.others) })) };
    case 'share_change':
      return { kind: m.kind, label, product: x.product, importer: x.importer ?? null, supplier: x.supplier ?? null, rows: ((x.rows as [number, number, boolean][]) ?? []).map(([t, s, f]) => ({ t: per(t), share_pct: pct(s), filed: f })) };
    case 'partner_shares': {
      const ps = x as unknown as PartnerShares;
      return { kind: m.kind, label, product: ps.product, economy: ps.economy, role: ps.role, periods: ps.t.map(per), partners: ps.series.slice(0, 6).map((s) => ({ code: s.id, share_pct: s.share.map((v) => pct(v)) })) };
    }
    case 'between_groups':
      return { kind: m.kind, label, product: x.product, a: x.a, b: x.b, columns: ['t', 'within_a_pct', 'within_b_pct', 'between_pct'], rows: ((x.rows as number[][]) ?? []).map((r) => [per(r[0]), pct(r[1]), pct(r[2]), pct(r[3])]) };
    case 'connector_scatter':
      return { kind: m.kind, label, a: x.a, b: x.b, w0: x.w0, w1: x.w1, columns: ['code', 'change_in_share_of_a_imports_pp', 'change_in_share_of_b_exports_pp', 'share_of_a_imports_pct'], rows: ((x.points as number[][]) ?? []).slice(0, 25).map((r) => [code(r[0]), pct(r[1]), pct(r[2]), pct(r[3])]) };
    case 'fragility_rank': {
      const l = (x.latest ?? x) as { year: number; kor_score: number; world_score: number; cols: string[]; rows: (string | number)[][] };
      const c = Object.fromEntries((l.cols ?? []).map((k, j) => [k, j]));
      return { kind: m.kind, label, year: l.year, korea_score: ratio(l.kor_score), world_score: ratio(l.world_score), rows: (l.rows ?? []).slice(0, 15).map((r) => ({
        product: r[c.product], chain: r[c.chain], rung: r[c.stage], exporter_hhi: ratio(r[c.hhi] as number), supplier_hhi: ratio(r[c.hhi_sup] as number),
        top_exporter: code(r[c.top_exporter]), top_share_pct: pct(r[c.top_share] as number), korea_import_share_pct: pct(r[c.kor_import_share] as number),
        korea_top_supplier: code(r[c.kor_top_supplier]), korea_top_supplier_share_pct: pct(r[c.kor_top_supplier_share] as number),
      })) };
    }
    case 'fragility_korea':
      return { kind: m.kind, label, years: x.years, korea_score: ((x.kor_score as number[]) ?? []).map((v) => ratio(v)), world_score: ((x.world_score as number[]) ?? []).map((v) => ratio(v)) };
    case 'movers': {
      const row = ([i, d, s]: number[]) => ({ code: code(i), change_in_share_pp: pct(d), share_of_world_exports_pct: pct(s) });
      return { kind: m.kind, label, product: x.product, base: per(x.base), t: per(x.t), world_trade_change_pct: change(x.world_change as number), gained: ((x.up as number[][]) ?? []).slice(0, 5).map(row), lost: ((x.down as number[][]) ?? []).slice(0, 5).map(row) };
    }
    default:
      return { kind: m.kind, label };
  }
}

export async function caseView(id: string, lang: Lang): Promise<Envelope> {
  const meta = await getMeta();
  const [idx, ev] = await Promise.all([casesIndex(), eventsIndex().catch(() => null)]);
  if (!idx.cases.some((c) => c.id === id)) {
    throw unknownId('unknown-case', 'Unknown case study', `${id.slice(0, 60)} is not a trade-flow case study. GET /v1/trade-flow/cases lists the ${idx.cases.length} cases and their ids.`);
  }
  const doc = await readData<CaseDoc>(`cases/${id}.json`);
  const evId = (num: string) => ev?.events.find((e) => e.num === num)?.id ?? null;
  const measures = (doc.measured ?? []).flatMap((m) => (m.error ? [] : m.items?.length ? m.items.map((it) => measure(meta, { ...it, spec: it.spec ?? m.spec }, lang)) : [measure(meta, m, lang)]));
  const sc = doc.scenario as unknown as { kind: string; product?: string; supplier?: string; cut?: number; period?: number; en?: string; ko?: string } | null;
  const usesMonths = doc.network?.freq === 'M';
  const { sources, notes } = sourcesFor(meta, usesMonths ? 'M' : 'A', usesMonths && doc.network ? [doc.network.from > 9999 ? doc.network.from : doc.network.from * 100 + 1, doc.network.to > 9999 ? doc.network.to : doc.network.to * 100 + 12] : null);
  notes.push('Dollar amounts in the page’s text are shown as […] or left out here: the API returns derived records only (shares, ranks, changes); the page has them. Papers are quoted as the page quotes them (verified against the jejualps archive).');
  const papers = (doc.papers ?? []).map((p) => ({
    authors: p.authors, year: p.year, series: p.series, number: p.number, title: p.title, url: p.url, date: p.date,
    finding: bi(p.finding, lang), quote: Array.isArray(p.quote) ? p.quote : [p.quote], verified: p.verified,
  }));
  const summary = `${doc.title.en}. ${doc.question.en} The case reads ${papers.length} paper${papers.length === 1 ? '' : 's'} (${papers.map((p) => `${p.authors} ${p.year}`).join('; ')}) against UN Comtrade trade shares${sc && sc.kind !== 'none' ? ', with a first-round scenario' : ''}.`;
  return envelope(meta, 'case', {
    page: pageOf(lang, `/cases/${id}`), sources, notes, summary,
    data: {
      id: doc.id, num: doc.num, title: bi(doc.title, lang), question: bi(doc.question, lang),
      events: doc.events.map(evId).filter((x): x is string => !!x), chains: doc.carries_over ?? [],
      papers,
      network: doc.network ? { freq: doc.network.freq, products: doc.network.products, from: periodOf(doc.network.from), to: periodOf(doc.network.to), base: typeof doc.network.base === 'number' ? periodOf(doc.network.base) : doc.network.base } : null,
      measures,
      scenario: sc && sc.kind !== 'none' ? {
        kind: sc.kind, product: sc.product ?? null, supplier: sc.supplier ?? null, cut_pct: sc.cut != null ? pct(sc.cut) : null, year: sc.period ?? null,
        description: withoutAmounts(bi(sc.en != null ? { en: sc.en, ko: sc.ko ?? '' } : null, lang)),
      } : null,
      korea: withoutAmounts(bi(doc.korea, lang)),
      limits: withoutAmounts(bi(doc.limits, lang)),
    },
  });
}

