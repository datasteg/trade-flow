// The fixed hooks of the view contract: manifest, search, item (readable Markdown of what a page shows, for the
// cross-app fetch tool), economy (a headline) and economies. Built from the same views as the REST answers.
import type { ChainIndexFile } from '@/components/chains/types';
import type { CasesIndex, EventsIndex } from '@/components/stories/types';
import { readData } from '@/lib/data';
import { caseView, chainView, eventView } from './catalog';
import {
  APP, badParam, builtAt, economies, econRef, envelope, getMeta, pageOf, productName, productOf, release, sourcesFor, SvcFail,
  unknownId, windowMonths, ym, type Envelope, type Lang,
} from './core';
import { bullets, md } from './prose';
import { economyView, productView } from './trade';
import { nodeIndex, type Meta } from '@larch/net/core';

export const VIEWS = ['economy', 'bilateral', 'products', 'product', 'chains', 'chain', 'events', 'event', 'cases', 'case', 'supplier_cut'];
export const ITEM_KINDS = ['economy', 'chain', 'event', 'case', 'product'] as const;

export async function manifest() {
  const meta = await getMeta();
  return { app: APP, surface: '1.0', release: release(), built: builtAt(meta), views: VIEWS, item_kinds: ITEM_KINDS, records: { originals: meta.records.originals } };
}

/* search ------------------------------------------------------------------------------------------------------------------ */

interface Item { id: string; kind: string; title: string; snippet: string; page: string; score: number }

const norm = (s: string) => s.normalize('NFKC').toLowerCase().replace(/[’']/g, '').trim();

/** 1 for an exact code or name, 0.9 a name that starts with the query, 0.8 a word that does, 0.6 the query inside a
 *  name, 0.4 inside the snippet. */
function score(q: string, codes: string[], names: string[], text: string): number {
  if (codes.some((c) => norm(c) === q) || names.some((n) => norm(n) === q)) return 1;
  if (names.some((n) => norm(n).startsWith(q))) return 0.9;
  if (names.some((n) => norm(n).split(/[\s,()·/-]+/).some((w) => w.startsWith(q)))) return 0.8;
  if (names.some((n) => norm(n).includes(q))) return 0.6;
  if (q.length >= 3 && norm(text).includes(q)) return 0.4;
  return 0;
}

export async function search(url: URL, lang: Lang): Promise<{ items: Item[] }> {
  const raw = (url.searchParams.get('q') ?? '').trim().slice(0, 80);
  if (!raw) throw badParam('q is required: a code or a name, such as KOR, Korea, HS:85, batteries or tariffs.');
  const lim = url.searchParams.get('limit');
  const limit = lim == null ? 10 : Number(lim);
  if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw badParam(`limit must be an integer from 1 to 20; got "${lim}".`);
  const q = norm(raw);
  const meta = await getMeta();
  const [chains, events, cases] = await Promise.all([
    readData<ChainIndexFile>('chains/index.json'), readData<EventsIndex>('events/index.json'), readData<CasesIndex>('cases/index.json'),
  ]);
  const name = (x: { en: string; ko: string }) => (lang === 'ko' ? x.ko || x.en : x.en);
  const out: Item[] = [];
  const add = (it: Omit<Item, 'score'>, s: number) => { if (s > 0) out.push({ ...it, score: s }); };
  for (const i of economies(meta)) {
    const n = meta.nodes[i];
    add({ id: `economy:${n.id}`, kind: 'economy', title: name(n), snippet: `${n.id} · ${n.en} · ${n.subregion ?? n.region ?? ''}`.trim(), page: pageOf(lang, `/explore-monthly?focus=${n.id}`) },
      score(q, [n.id], [n.en, n.ko, n.name], `${n.subregion ?? ''} ${n.region ?? ''}`));
  }
  for (const p of meta.products) {
    const codes = [p.id, p.slug, ...(p.kind === 'chapter' ? p.codes.map((c) => `HS ${c}`) : []), ...(p.aliases ?? [])];
    add({ id: `product:${p.id}`, kind: 'product', title: productName(p, lang), snippet: `${p.id} · ${p.kind}${p.codes.length ? ` · HS ${p.codes.slice(0, 6).join(', ')}` : ''}`, page: pageOf(lang, `/${p.W ? 'explore-monthly' : 'explore'}${p.id === 'TOTAL' ? '' : `?p=${p.id}`}`) },
      score(q, codes, [p.en, p.ko, p.label_long ?? ''], p.codes.join(' ')));
  }
  for (const c of chains.chains) {
    add({ id: `chain:${c.id}`, kind: 'chain', title: name(c), snippet: `${c.stages} stages, ${c.levels.map((l) => l.en).join(' → ')}`, page: pageOf(lang, `/chains/${c.id}`) },
      score(q, [c.id], [c.en, c.ko], c.levels.map((l) => `${l.en} ${l.ko}`).join(' ')));
  }
  for (const e of events.events) {
    add({ id: `event:${e.id}`, kind: 'event', title: name(e.title), snippet: `${e.start}${e.ongoing ? ', ongoing' : e.end ? ` to ${e.end}` : ''} · ${e.kind}`, page: pageOf(lang, `/events/${e.id}`) },
      score(q, [e.id, e.num], [e.title.en, e.title.ko], `${e.dek.en} ${e.dek.ko} ${e.economies.join(' ')}`));
  }
  for (const c of cases.cases) {
    add({ id: `case:${c.id}`, kind: 'case', title: name(c.title), snippet: name(c.question), page: pageOf(lang, `/cases/${c.id}`) },
      score(q, [c.id], [c.title.en, c.title.ko], `${c.question.en} ${c.question.ko}`));
  }
  const order = { economy: 0, product: 1, chain: 2, event: 3, case: 4 } as Record<string, number>;
  out.sort((a, b) => b.score - a.score || order[a.kind] - order[b.kind] || a.title.localeCompare(b.title));
  return { items: out.slice(0, limit) };
}

/* item ------------------------------------------------------------------------------------------------------------------------ */

type Row = Record<string, unknown>;
const r = (x: unknown) => x as Row;
const list = (x: unknown) => (Array.isArray(x) ? (x as Row[]) : []);

function economyText(e: Envelope, imports: Envelope): string {
  const d = r(e.data), m = r(imports.data);
  const ex = r(d.exports), im = r(d.imports);
  const ts = im.top_supplier ? r(im.top_supplier) : null;
  const partnerLines = (xs: Row[], what: string) => xs.map((p) => `${p.rank}. ${p.name} (${p.code}): ${p.share_of_economy_pct}% of ${what}, ${p.share_of_world_pct}% of world trade, mirror ratio ${p.mirror_ratio ?? 'n/a'}`);
  const prodLines = (xs: Row[], what: string) => xs.map((p) => `${p.rank}. HS ${p.hs} ${p.name}: ${p.share_of_economy_pct}% of ${what}${p.change_on_year_pct != null ? `, ${Number(p.change_on_year_pct) >= 0 ? '+' : ''}${p.change_on_year_pct}% on a year earlier` : ''}`);
  const econ = r(d.economy), per = r(d.period);
  const when = per.freq === 'M' ? `12 months ${per.from} to ${per.to}` : `year ${per.year}`;
  return md([
    `# ${econ.name} (${econ.code}): trade, ${when}`,
    e.summary,
    d.traded ? bullets([
      `Exports: ${ex.share_of_world_pct}% of world exports, rank ${ex.rank} of ${ex.of}; ${ex.destinations} destinations; market HHI ${ex.market_hhi ?? 'n/a'}`,
      `Imports: ${im.share_of_world_pct}% of world imports, rank ${im.rank} of ${im.of}; ${im.suppliers} suppliers; supplier HHI ${im.supplier_hhi ?? 'n/a'}${ts ? `; top supplier ${ts.name} (${ts.share_of_imports_pct}% of imports)` : ''}`,
    ]) : 'No trade in this period.',
    list(d.partners).length ? `## Largest destinations\n\n${partnerLines(list(d.partners), 'its exports').join('\n')}` : null,
    list(m.partners).length ? `## Largest suppliers\n\n${partnerLines(list(m.partners), 'its imports').join('\n')}` : null,
    list(d.products).length ? `## Largest export chapters (${d.products_window})\n\n${prodLines(list(d.products), 'exports').join('\n')}` : null,
    list(m.products).length ? `## Largest import chapters (${m.products_window})\n\n${prodLines(list(m.products), 'imports').join('\n')}` : null,
    e.notes?.length ? `## Notes\n\n${bullets(e.notes)}` : null,
    `Source: ${e.sources.map((s) => `${s.publisher}, ${s.dataset}`).join('; ')}. Page: ${e.page}`,
  ]);
}

function productText(e: Envelope): string {
  const d = r(e.data), p = r(d.product);
  const lines = (xs: Row[]) => xs.map((x) => `${x.rank}. ${x.name} (${x.code}): ${x.share_of_world_pct}%`).join('\n');
  return md([
    `# ${p.name} (${p.id})`, e.summary,
    bullets([`Kind: ${p.kind}${list(p.codes).length ? `; HS codes ${(p.codes as string[]).join(', ')}` : ''}`, `Years ${(p.years as number[]).join('–')}${p.windows ? `; 12-month windows ${(p.windows as string[]).join(' to ')}` : ''}`,
      `Exporter HHI ${d.exporter_hhi ?? 'n/a'}; five largest exporters ${d.top5_share_pct}% of world exports`]),
    `## Largest exporters (share of world exports)\n\n${lines(list(d.top_exporters))}`,
    `## Largest importers (share of world imports)\n\n${lines(list(d.top_importers))}`,
    e.notes?.length ? `## Notes\n\n${bullets(e.notes)}` : null,
    `Source: ${e.sources.map((s) => `${s.publisher}, ${s.dataset}`).join('; ')}. Page: ${e.page}`,
  ]);
}

function chainText(e: Envelope): string {
  const d = r(e.data);
  const stages = list(d.stages).map((s) => {
    const tops = list(s.top_exporters).slice(0, 3).map((x) => `${x.name} ${x.share_of_world_pct}%`).join(', ');
    return `- Rung ${s.rung}, ${s.name} (${s.key}${s.role ? `, ${s.role}` : ''}): exporter HHI ${s.exporter_hhi ?? 'n/a'}${s.chokepoint ? ' (the chain’s chokepoint)' : ''}${tops ? `; largest exporters ${tops}` : ''}`;
  });
  return md([`# ${r(d.chain).name}: the chain in ${d.year}`, e.summary, `## Stages\n\n${stages.join('\n')}`,
    e.notes?.length ? `## Notes\n\n${bullets(e.notes)}` : null, `Source: UN Comtrade, annual data, mirror rule. Page: ${e.page}`]);
}

function eventText(e: Envelope): string {
  const d = r(e.data);
  const rd = d.reading ? r(d.reading) : null;
  const movers = list(d.movers).map((m) => `- ${r(m.product).name}, ${m.base} → ${m.t}: world trade ${m.world_trade_change_pct ?? 'n/a'}%; gained share: ${list(m.gained).map((x) => `${x.name} ${x.change_in_share_pp}pp`).join(', ')}; lost: ${list(m.lost).map((x) => `${x.name} ${x.change_in_share_pp}pp`).join(', ')}`);
  return md([
    `# ${d.title}`, `${d.start}${d.ongoing ? ', ongoing' : d.end ? ` to ${d.end}` : ''} · ${d.kind}`, String(d.dek ?? ''),
    list(d.timeline).length ? `## Timeline\n\n${list(d.timeline).map((x) => `- ${x.date}: ${x.text}${x.source ? ` [${x.source}]` : ''}`).join('\n')}` : null,
    d.watch ? `## What to watch\n\n${d.watch}` : null,
    movers.length ? `## Who gained and lost share\n\n${movers.join('\n')}` : null,
    rd ? `## Reading the numbers\n\n${rd.window ? `${rd.window}\n\n` : ''}${list(rd.items).map((x) => `- ${x.numbers}${x.text ? ` ${x.text}` : ''}`).join('\n')}` : null,
    list(d.sources).length ? `## Sources\n\n${list(d.sources).map((x) => `${x.n}. ${x.title}, ${x.publisher}${x.date ? `, ${x.date}` : ''}: ${x.url}`).join('\n')}` : null,
    e.notes?.length ? `## Notes\n\n${bullets(e.notes)}` : null, `Page: ${e.page}`,
  ]);
}

function caseText(e: Envelope): string {
  const d = r(e.data);
  const sc = d.scenario ? r(d.scenario) : null;
  return md([
    `# ${d.title}`, String(d.question ?? ''),
    list(d.papers).length ? `## Papers\n\n${list(d.papers).map((p) => `- ${p.authors} (${p.year}), "${p.title}", ${p.series}${p.number ? ` ${p.number}` : ''}: ${p.finding} ${p.url}`).join('\n')}` : null,
    sc ? `## Scenario\n\n${sc.description} (${sc.kind}, ${sc.product}, ${sc.year}).` : null,
    d.korea ? `## Korea\n\n${d.korea}` : null, d.limits ? `## Limits\n\n${d.limits}` : null,
    e.notes?.length ? `## Notes\n\n${bullets(e.notes)}` : null, `Page: ${e.page}`,
  ]);
}

const TEXT_MAX = 20000;
const cap = (s: string) => (s.length <= TEXT_MAX ? s : `${s.slice(0, TEXT_MAX - 40).trimEnd()}\n\n(cut; the page has the rest)`);

export async function item(url: URL, lang: Lang): Promise<Envelope> {
  const id = (url.searchParams.get('id') ?? '').trim().slice(0, 120);
  const k = id.indexOf(':');
  if (k <= 0) throw badParam(`id must be <kind>:<key>, such as economy:KOR, product:HS:85, chain:batteries, event:covid-2020 or case:chips; got "${id}".`);
  const kind = id.slice(0, k), key = id.slice(k + 1);
  if (!(ITEM_KINDS as readonly string[]).includes(kind)) throw unknownId('unknown-kind', 'Unknown item kind', `${kind} is not an item kind of trade-flow. Kinds: ${ITEM_KINDS.join(', ')}.`);
  let e: Envelope, text: string, title: string;
  const meta = await getMeta();
  if (kind === 'economy') {
    e = await economyView({ iso3: key, period: null, product: null, direction: 'exports', limit: 10, lang });
    const im = await economyView({ iso3: key, period: null, product: null, direction: 'imports', limit: 10, lang });
    text = economyText(e, im);
    title = String(r(r(e.data).economy).name);
  } else if (kind === 'product') {
    e = await productView({ id: key, period: null, lang });
    text = productText(e);
    title = String(r(r(e.data).product).name);
  } else if (kind === 'chain') {
    e = await chainView({ chain: key, economy: null, year: null, lang });
    text = chainText(e);
    title = String(r(r(e.data).chain).name);
  } else if (kind === 'event') {
    e = await eventView(key, lang);
    text = eventText(e);
    title = String(r(e.data).title);
  } else {
    e = await caseView(key, lang);
    text = caseText(e);
    title = String(r(e.data).title);
  }
  return envelope(meta, 'item', {
    period: e.period, page: e.page, sources: e.sources, notes: e.notes, summary: e.summary,
    data: { id: `${kind}:${key}`, title, text: cap(text), metadata: { kind, key, view: e.view, page: e.page, release: e.release } },
  });
}

/* economy, economies --------------------------------------------------------------------------------------------------- */

export async function economyHook(iso3: string, lang: Lang): Promise<Envelope> {
  const meta = await getMeta();
  const code = iso3.toUpperCase().slice(0, 12);
  const i = /^[A-Z0-9_]{3}$/.test(code) ? nodeIndex(meta, code) : null;
  const shown = meta.shown?.W ?? meta.complete.M;
  const { sources, notes } = sourcesFor(meta, 'M', windowMonths(shown));
  const base = { period: { freq: 'M', window_months: 12, shown: ym(shown), newest: ym(meta.last.M), complete_a: meta.complete.A }, sources };
  const none = (why: string) => envelope(meta, 'economy', {
    ...base, page: pageOf(lang, '/explore-monthly'), summary: `trade-flow does not cover ${code}: ${why}`,
    data: { covered: false, name: i != null ? econRef(meta, i, lang).name : null, headline: [], links: [{ label: 'Monthly explorer', page: pageOf(lang, '/explore-monthly') }] },
  });
  if (i == null) return none('it is not an economy code in UN Comtrade’s network as trade-flow builds it.');
  if (meta.nodes[i].hist || !/^[A-Z]{3}$/.test(meta.nodes[i].id)) return none('it is a historical economy or a Comtrade special area, not on the explorer’s list today.');
  let ex: Envelope, im: Envelope;
  try {
    [ex, im] = await Promise.all([
      economyView({ iso3: code, period: null, product: null, direction: 'exports', limit: 1, lang }),
      economyView({ iso3: code, period: null, product: null, direction: 'imports', limit: 1, lang }),
    ]);
  } catch (e) {
    if (e instanceof SvcFail) return none(e.detail);
    throw e;
  }
  const d = r(ex.data), m = r(im.data);
  if (!d.traded) return none(`it has no trade in the 12 months to ${ym(shown)}.`);
  const per = ym(shown);
  const x = r(d.exports), mm = r(d.imports);
  const headline: { label: string; value: number | string | null; unit: string; period: string }[] = [
    { label: 'Exports, share of world exports', value: x.share_of_world_pct as number, unit: '%', period: per },
    { label: 'Export rank among economies', value: x.rank as number, unit: 'rank', period: per },
    { label: 'Imports, share of world imports', value: mm.share_of_world_pct as number, unit: '%', period: per },
    { label: 'Import rank among economies', value: mm.rank as number, unit: 'rank', period: per },
  ];
  const p0 = list(d.partners)[0], s0 = list(m.partners)[0];
  if (p0) headline.push({ label: `Largest export destination: ${p0.name} (${p0.code})`, value: p0.share_of_economy_pct as number, unit: '% of exports', period: per });
  if (s0) headline.push({ label: `Largest supplier: ${s0.name} (${s0.code})`, value: s0.share_of_economy_pct as number, unit: '% of imports', period: per });
  const c0 = list(d.products)[0], c1 = list(m.products)[0];
  if (c0) headline.push({ label: `Largest export chapter: HS ${c0.hs} ${c0.name}`, value: c0.share_of_economy_pct as number, unit: '% of exports', period: per });
  if (c1) headline.push({ label: `Largest import chapter: HS ${c1.hs} ${c1.name}`, value: c1.share_of_economy_pct as number, unit: '% of imports', period: per });
  const iso = meta.nodes[i].id;
  return envelope(meta, 'economy', {
    ...base, page: ex.page, notes: [...notes, ...(ex.notes ?? []).filter((n) => n.includes('usual trade'))],
    summary: ex.summary,
    data: {
      covered: true, name: econRef(meta, i, lang).name, code: iso, headline: headline.slice(0, 8),
      links: [
        { label: 'Monthly explorer, this economy', page: pageOf(lang, `/explore-monthly?focus=${iso}`) },
        { label: 'Explorer by year, this economy', page: pageOf(lang, `/explore?focus=${iso}`) },
        { label: 'Product chains (add ?focus= to mark it on a chain page)', page: pageOf(lang, '/chains') },
      ],
    },
  });
}

export async function economiesHook(lang: Lang): Promise<Envelope> {
  const meta = await getMeta();
  const list = economies(meta).map((i) => ({ ...econRef(meta, i, lang), page: pageOf(lang, `/explore-monthly?focus=${meta.nodes[i].id}`) }));
  return envelope(meta, 'economies', {
    page: pageOf(lang, '/explore-monthly'), ...sourcesFor(meta, 'A'),
    summary: `trade-flow covers ${list.length} economies in UN Comtrade's network (ISO 3166-1 alpha-3 codes; historical economies and Comtrade special areas left out).`,
    data: { economies: list },
  });
}

