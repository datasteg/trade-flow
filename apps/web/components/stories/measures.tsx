// "What our data show": each measured result of a case (or an event's movers and partner shares) as a chart or a
// small table, with a one-line reading written from the numbers, never from the paper. One function per kind
// (scripts/build_stories.py Measure.*); results with `items` (one per `each:` value or period) are drawn together.
import type { ReactNode } from 'react';
import { Notice, ShareBar, type DataColumn, type DataRow } from '@larch/ui';
import { formatPercentChange, formatPointChange, formatShare, t, type Lang } from '@/lib/i18n';
import { BarList, type Bar } from './BarList';
import { Figure, type FigureTable } from './Figure';
import { LineChart, periodTicks, type LineSeries } from './LineChart';
import { Book, cap, mid, periodLabel, poss, sourceLine, tickLabel, yearBefore } from './names';
import { FocusOnly } from '@/components/FocusOnly';
import { Scatter } from './Scatter';
import type {
  BetweenGroups, ConnectorScatter, FragilityKorea, FragilityRank, KoreaExposure, Lens, Measured, MeasureSpec, Movers,
  PartnerShares, PartnerSplit, ShareChange, TopExporters, WorldChange,
} from './types';

export interface Ctx {
  lang: Lang;
  book: Book;
  /** For CSV file names and element ids. */
  id: string;
  /** The last complete month (meta.complete.M): later months are partial. */
  completeM: number;
  /** The customs citation for the page's monthly figures. */
  cite?: string;
}

const SLOTS = ['viz-1', 'viz-2', 'viz-3', 'viz-4', 'viz-5'];

// -- formatting ----------------------------------------------------------------------------------------------------

export function fs(v: number | null | undefined, lang: Lang): string {
  if (v == null) return '–';
  return formatShare(v, lang, { decimals: Math.abs(v) < 0.01 && v !== 0 ? 2 : 1 });
}
export const fp = (v: number | null | undefined, lang: Lang) => formatPointChange(v, lang, { decimals: 1 });
export const fc = (v: number | null | undefined, lang: Lang) => formatPercentChange(v, lang, { decimals: 1 });
const shareTick = (lang: Lang) => (v: number) => formatShare(v, lang, { decimals: Math.abs(v) < 0.1 && v !== 0 && Math.round(v * 100) !== v * 100 ? 1 : 0 });
const ppTick = (lang: Lang) => (v: number) => formatPointChange(v, lang, { decimals: Math.abs(v) < 0.02 && v !== 0 ? 1 : 0 });

function list(parts: string[], lang: Lang): string {
  if (parts.length <= 1) return parts[0] ?? '';
  if (lang === 'ko') return parts.join(', ');
  return parts.length === 2 ? `${parts[0]} and ${parts[1]}` : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

function title(spec: MeasureSpec | undefined, lang: Lang): string {
  return (spec?.[lang] as string | undefined) ?? (spec?.en as string | undefined) ?? '';
}

function col(key: string, label: ReactNode, num = false, sortable = true): DataColumn {
  return { key, label, num, sortable };
}

/** The leaves of a result: itself, or its items (one level, or two for each × periods). */
function leaves(m: Measured): Measured[] {
  if (!m.items) return [m];
  return m.items.flatMap((x) => (x.items ? x.items.map((y) => ({ ...y, each: { ...x.each, ...y.each } })) : [x]));
}

// -- the dispatcher --------------------------------------------------------------------------------------------------

export function MeasureFigure({ m, ctx, n }: { m: Measured; ctx: Ctx; n: number }) {
  const { lang } = ctx;
  const spec = m.spec;
  if (m.error) {
    return (
      <Notice tone="warning" title={title(spec, lang) || m.kind}>
        {t(lang, 'cases.measure.failed')}
      </Notice>
    );
  }
  const fid = `${ctx.id}-${n + 1}`;
  const kind = m.kind;
  const items = leaves(m);
  // a measure the config marks as one economy's (focus: KOR) shows with that focus only
  const only = typeof spec?.focus === 'string' ? spec.focus : null;
  if (only) return <FocusOnly iso={only}><MeasureFigure m={{ ...m, spec: { ...spec, focus: undefined } as MeasureSpec }} ctx={ctx} n={n} /></FocusOnly>;
  switch (kind) {
    case 'world_change': return <WorldChangeFig items={items as WorldChange[]} spec={spec} ctx={ctx} fid={fid} />;
    case 'partner_split': return <PartnerSplitFig m={m as PartnerSplit} spec={spec} ctx={ctx} fid={fid} />;
    case 'partner_shares':
      return <>{items.map((x, i) => <PartnerSharesFig key={i} m={x as PartnerShares} spec={spec} ctx={ctx} fid={`${fid}${items.length > 1 ? `-${i + 1}` : ''}`} heading={items.length > 1 ? sharesHeading(x as PartnerShares, ctx) : undefined} />)}</>;
    case 'share_change': return <ShareChangeFig items={items as ShareChange[]} spec={spec} ctx={ctx} fid={fid} />;
    case 'top_exporters': return <TopExportersFig items={items as TopExporters[]} spec={spec} ctx={ctx} fid={fid} />;
    // measured for Korea alone: shown with ?focus=KOR only
    case 'korea_exposure': return <FocusOnly iso="KOR"><KoreaExposureFig m={m} items={items as KoreaExposure[]} spec={spec} ctx={ctx} fid={fid} /></FocusOnly>;
    case 'between_groups': return <BetweenGroupsFig m={m as BetweenGroups} spec={spec} ctx={ctx} fid={fid} />;
    case 'connector_scatter':
      return <>{items.map((x, i) => <ScatterFig key={i} m={x as ConnectorScatter} spec={spec} ctx={ctx} fid={`${fid}${items.length > 1 ? `-${i + 1}` : ''}`} multi={items.length > 1} />)}</>;
    case 'fragility_rank': return <FragilityRankFig m={m as FragilityRank} spec={spec} ctx={ctx} fid={fid} />;
    case 'fragility_korea': return <FocusOnly iso="KOR"><FragilityKoreaFig m={m as FragilityKorea} spec={spec} ctx={ctx} fid={fid} /></FocusOnly>;
    case 'movers': return <MoversFig m={m as Movers} ctx={ctx} fid={fid} heading={title(spec, lang)} />;
    default:
      return <Notice tone="info" title={title(spec, lang) || kind}>{t(lang, 'cases.measure.unknown')}</Notice>;
  }
}

function sharesHeading(m: PartnerShares, ctx: Ctx): string {
  const { lang, book } = ctx;
  return t(lang, m.role === 'importer' ? 'cases.head.importsOf' : 'cases.head.exportsOf', {
    econ: book.econ(m.economy, lang), product: mid(book.product(m.product, lang), lang),
  });
}

// -- world_change ----------------------------------------------------------------------------------------------------

function WorldChangeFig({ items, spec, ctx, fid }: { items: WorldChange[]; spec?: MeasureSpec; ctx: Ctx; fid: string }) {
  const { lang, book } = ctx;
  const first = items[0];
  const multiProduct = items.length > 1;
  const rows = items.flatMap((m) => m.values.map((v) => ({ m, v })));
  const lens = first.lens;
  const sameYearBefore = rows.every(({ v }) => v.against === yearBefore(v.t));
  const label = (m: WorldChange, v: WorldChange['values'][number]) =>
    multiProduct ? (m.values.length > 1 ? `${book.product(m.product, lang)}, ${periodLabel(v.t, lang, lens)}` : book.product(m.product, lang)) : periodLabel(v.t, lang, lens);
  const bars: Bar[] = rows.map(({ m, v }, i) => ({ id: `${i}`, label: label(m, v), value: v.change, text: fc(v.change, lang) }));

  // The reading: who, against what, the values (all when few; the extremes and the turn when many).
  const imp = first.importers;
  const who = imp.all ? t(lang, 'cases.wc.world')
    : imp.complete ? t(lang, 'cases.wc.complete', { n: imp.n ?? 0 })
      : book.econ(imp.economies ?? '', lang);
  const partner = first.partner ? t(lang, 'cases.wc.from', { econ: book.econ(first.partner, lang) }) : '';
  const product = imp.all
    ? (multiProduct ? '' : t(lang, 'cases.wc.in', { product: mid(book.product(first.product, lang), lang) }))
    : (multiProduct ? t(lang, 'cases.wc.products') : mid(book.product(first.product, lang), lang));
  const against = sameYearBefore ? t(lang, 'cases.wc.yearBefore')
    : t(lang, 'cases.wc.against', { p: periodLabel(rows[0].v.against, lang, lens) });
  let values: string;
  const vals = rows.filter(({ v }) => v.change != null);
  if (vals.length <= 3) {
    values = list(vals.map(({ m, v }) => t(lang, 'cases.wc.item', { v: fc(v.change, lang), p: multiProduct ? mid(label(m, v), lang) : label(m, v) })), lang);
  } else {
    const lo = vals.reduce((a, b) => ((b.v.change as number) < (a.v.change as number) ? b : a));
    const hi = vals.reduce((a, b) => ((b.v.change as number) > (a.v.change as number) ? b : a));
    // the lowest of the periods shown, named as such (a window, not the year)
    const span = `${label(vals[0].m, vals[0].v)}–${label(vals[vals.length - 1].m, vals[vals.length - 1].v)}`;
    const parts = [multiProduct ? t(lang, 'cases.wc.lowest', { v: fc(lo.v.change, lang), p: label(lo.m, lo.v) })
      : t(lang, 'cases.wc.lowestIn', { span, v: fc(lo.v.change, lang), p: label(lo.m, lo.v) })];
    // the first period back above a year earlier, and (when it fell back again) the dip and the period from which every
    // later one stays above: two different months, computed separately
    const up = (i: number) => (vals[i].v.change as number) >= 0;
    const at = (i: number) => ({ v: fc(vals[i].v.change, lang), p: label(vals[i].m, vals[i].v) });
    const first = vals.findIndex((_, i) => i > 0 && up(i) && !up(i - 1));
    let kept = -1;
    for (let i = vals.length - 1; i > 0 && up(i); i--) if (!up(i - 1)) kept = i;
    if (first > 0 && first === kept) parts.push(t(lang, 'cases.wc.turn', at(first)));
    else if (first > 0) {
      parts.push(t(lang, 'cases.wc.turnFirst', at(first)));
      const dip = vals.findIndex((_, i) => i > first && !up(i));
      if (dip > 0) parts.push(t(lang, 'cases.wc.dip', at(dip)));
      if (kept > 0) parts.push(t(lang, 'cases.wc.kept', at(kept)));
    } else parts.push(t(lang, 'cases.wc.highest', { v: fc(hi.v.change, lang), p: label(hi.m, hi.v) }));
    values = parts.join(lang === 'ko' ? ', ' : '; ');
  }
  const reading = t(lang, imp.all ? 'cases.read.wcWorld' : 'cases.read.wc', { who, partner, product, against, values }).replace(/\s+/g, ' ');

  const table: FigureTable = {
    columns: [
      ...(multiProduct ? [col('product', t(lang, 'cases.col.product'))] : []),
      col('t', t(lang, 'cases.col.period')), col('against', t(lang, 'cases.col.against')),
      col('change', t(lang, 'cases.col.change'), true),
    ],
    rows: rows.map(({ m, v }, i): DataRow => ({
      id: `${i}`,
      cells: { product: book.product(m.product, lang), t: periodLabel(v.t, lang, lens), against: periodLabel(v.against, lang, lens), change: fc(v.change, lang) },
      sort: { t: v.t, against: v.against, change: v.change },
    })),
    csv: [
      [t(lang, 'cases.col.product'), t(lang, 'cases.col.period'), t(lang, 'cases.col.against'), t(lang, 'cases.col.changeFrac')],
      ...rows.map(({ m, v }) => [m.product, v.t, v.against, v.change]),
    ],
    filename: `${fid}-change`,
  };
  return (
    <Figure lang={lang} title={title(spec, lang)} reading={reading} id={fid} table={table}
      notes={[spec?.note ? noteText(spec, lang) : null]}
      source={sourceLine(lang, { cite: ctx.cite, freq: first.freq, lens, rule: imp.all ? 'mirror' : 'importer' })}>
      <BarList bars={bars} diverging ariaLabel={reading} />
    </Figure>
  );
}

// -- partner_split ---------------------------------------------------------------------------------------------------

/** Imports from one partner beside imports from everyone else, period by period: the supplier-lockdown test. */
function PartnerSplitFig({ m, spec, ctx, fid }: { m: PartnerSplit; spec?: MeasureSpec; ctx: Ctx; fid: string }) {
  const { lang, book } = ctx;
  const lens = m.lens;
  const partner = book.econ(m.partner, lang);
  const from = t(lang, 'cases.split.from', { econ: partner });
  const others = t(lang, 'cases.split.others', { econ: partner });
  const bars: Bar[] = m.values.flatMap((v) => [
    { id: `${v.t}f`, label: `${periodLabel(v.t, lang, lens)} · ${from}`, value: v.from, text: fc(v.from, lang), focus: true },
    { id: `${v.t}o`, label: `${periodLabel(v.t, lang, lens)} · ${others}`, value: v.others, text: fc(v.others, lang) },
  ]);
  const reading = t(lang, 'cases.read.split', {
    who: t(lang, 'cases.wc.complete', { n: m.importers.n ?? 0 }),
    partner,
    values: list(m.values.map((v) => t(lang, 'cases.split.item', { p: periodLabel(v.t, lang, lens), a: fc(v.from, lang), b: fc(v.others, lang) })), lang),
  });
  const table: FigureTable = {
    columns: [col('t', t(lang, 'cases.col.period')), col('from', from, true), col('others', others, true)],
    rows: m.values.map((v, i): DataRow => ({
      id: `${i}`,
      cells: { t: periodLabel(v.t, lang, lens), from: fc(v.from, lang), others: fc(v.others, lang) },
      sort: { t: v.t, from: v.from, others: v.others },
    })),
    csv: [[t(lang, 'cases.col.period'), t(lang, 'cases.col.against'), `${from} (${t(lang, 'cases.col.changeFrac')})`, `${others} (${t(lang, 'cases.col.changeFrac')})`],
      ...m.values.map((v) => [v.t, v.against, v.from, v.others])],
    filename: `${fid}-split`,
  };
  return (
    <Figure lang={lang} title={title(spec, lang)} reading={reading} id={fid} table={table}
      notes={[spec?.note ? noteText(spec, lang) : null]}
      source={sourceLine(lang, { cite: ctx.cite, freq: m.freq, lens, rule: 'importer' })}>
      <BarList bars={bars} diverging ariaLabel={reading} />
    </Figure>
  );
}

/** A measure's `note` is written in English only in the config; on Korean pages it is shown only when there is a
 *  Korean one. */
function noteText(spec: MeasureSpec, lang: Lang): string | null {
  const ko = spec.note_ko as string | undefined;
  return lang === 'ko' ? (ko ?? null) : readerNote(spec.note as string);
}

/** A config note for the reader, or null when it is a note for the builder (file names, config keys, code ids). */
export function readerNote(note: string | null | undefined): string | null {
  if (!note) return null;
  return /`|\.py\b|\.ya?ml\b|regions\.|\b[BC]:[a-z]|codes_pre2022|FIRST_MONTH/.test(note) ? null : note;
}

// -- partner_shares --------------------------------------------------------------------------------------------------

export function PartnerSharesFig({ m, spec, ctx, fid, heading, extraNotes }: {
  m: PartnerShares; spec?: MeasureSpec; ctx: Ctx; fid: string; heading?: string; extraNotes?: ReactNode[];
}) {
  const { lang, book } = ctx;
  const monthly = m.freq === 'M';
  // An importer's own report missing: its shares that month are partners' reports only, so the line breaks there.
  const drop = m.t.map((_, i) => monthly && m.role === 'importer' && !m.filed[i]);
  const mask = (vs: (number | null)[]) => vs.map((v, i) => (drop[i] ? null : v));
  const series: LineSeries[] = m.series.map((s, i) => ({
    id: s.id, label: cap(book.econ(s.id, lang)), values: mask(s.share), colour: SLOTS[i] ?? 'viz-context',
  }));
  if (m.series.length > 1) series.push({ id: 'other', label: t(lang, 'cases.other'), values: mask(m.other), colour: 'viz-context' });
  const econ = book.econ(m.economy, lang);
  const product = mid(book.product(m.product, lang), lang);
  const lens = m.lens;

  // Reading: the first named partner (the one the measure is about), first and last value, and the extreme between.
  const s0 = series[0];
  let reading = '';
  if (s0) {
    const idx = s0.values.map((v, i) => (v == null ? -1 : i)).filter((i) => i >= 0);
    if (idx.length) {
      const a = idx[0], b = idx[idx.length - 1];
      const lo = idx.reduce((x, y) => ((s0.values[y] as number) < (s0.values[x] as number) ? y : x));
      const hi = idx.reduce((x, y) => ((s0.values[y] as number) > (s0.values[x] as number) ? y : x));
      const v0 = s0.values[a] as number, v1 = s0.values[b] as number;
      const ext = v1 < v0 ? (lo !== b ? lo : -1) : (hi !== b ? hi : -1);
      const key = m.role === 'importer' ? 'cases.read.sharesImp' : 'cases.read.sharesExp';
      reading = t(lang, key, {
        partner: s0.label, partnerP: poss(s0.label, lang), econ, econP: poss(econ, lang), product,
        v0: fs(v0, lang), p0: periodLabel(m.t[a], lang, lens), v1: fs(v1, lang), p1: periodLabel(m.t[b], lang, lens),
      });
      if (ext >= 0 && ext !== a) {
        reading += ' ' + t(lang, v1 < v0 ? 'cases.read.low' : 'cases.read.high', { v: fs(s0.values[ext], lang), p: periodLabel(m.t[ext], lang, lens) });
      }
    }
  }

  const ticks = periodTicks(m.t, 7, (p) => tickLabel(p, lang, m.t.length <= 15));
  const lastFiledGap = drop.some(Boolean)
    ? t(lang, 'cases.note.notFiled', { econ, p: list(m.t.filter((_, i) => drop[i]).map((p) => periodLabel(p, lang, lens)), lang) })
    : null;
  const partial = monthly && m.t[m.t.length - 1] > ctx.completeM && m.role === 'exporter';

  // Table: shares, the first partner's change on a year earlier (pp), the total's change on a year earlier.
  const pos = new Map(m.t.map((p, i) => [p, i]));
  const ppYear = (i: number) => {
    const j = pos.get(yearBefore(m.t[i]));
    const a = s0?.values[i], b = j == null ? null : s0?.values[j];
    return a != null && b != null ? a - b : null;
  };
  const table: FigureTable = {
    columns: [
      col('t', t(lang, 'cases.col.period')),
      ...series.map((s) => col(s.id, t(lang, 'cases.col.shareOf', { name: s.label }), true)),
      ...(s0 ? [col('pp', t(lang, 'cases.col.ppYear', { name: s0.label }), true)] : []),
      col('yoy', t(lang, m.role === 'importer' ? 'cases.col.totalImpYoy' : 'cases.col.totalExpYoy'), true),
      col('filed', t(lang, 'cases.col.filed')),
    ],
    rows: m.t.map((p, i): DataRow => ({
      id: String(p),
      cells: {
        t: periodLabel(p, lang, lens),
        ...Object.fromEntries(series.map((s) => [s.id, fs(s.values[i], lang)])),
        pp: fp(ppYear(i), lang), yoy: fc(m.yoy[i], lang),
        filed: m.filed[i] ? t(lang, 'cases.yes') : t(lang, 'cases.no'),
      },
      sort: { t: p, pp: ppYear(i), yoy: m.yoy[i], ...Object.fromEntries(series.map((s) => [s.id, s.values[i]])) },
    })),
    csv: [
      [t(lang, 'cases.col.period'), ...series.map((s) => t(lang, 'cases.col.shareOf', { name: s.label })),
        ...(s0 ? [t(lang, 'cases.col.ppYearFrac', { name: s0.label })] : []),
        t(lang, m.role === 'importer' ? 'cases.col.totalImpYoyFrac' : 'cases.col.totalExpYoyFrac'), t(lang, 'cases.col.filed')],
      ...m.t.map((p, i) => [p, ...series.map((s) => s.values[i]), ...(s0 ? [ppYear(i)] : []), m.yoy[i], m.filed[i] ? 1 : 0]),
    ],
    filename: `${fid}-shares`,
  };
  const head = heading ?? title(spec, lang) ?? sharesHeading(m, ctx);
  return (
    <Figure lang={lang} title={head || sharesHeading(m, ctx)} reading={reading} id={fid} table={table}
      notes={[...(extraNotes ?? []), spec?.note ? noteText(spec, lang) : null, lastFiledGap,
        m.prelim_from != null ? t(lang, 'cases.note.prelim', { econ, p: periodLabel(m.prelim_from, lang, lens) }) : null,
        m.role === 'exporter' ? t(lang, 'cases.note.asPartnersReport', { econ }) : null]}
      source={sourceLine(lang, { cite: ctx.cite, freq: m.freq, lens, rule: 'mirror' })}>
      <LineChart t={m.t} series={series} format={shareTick(lang)} ticks={ticks} zero ariaLabel={reading || head}
        band={partial ? { from: nextMonth(ctx.completeM), label: t(lang, 'cases.partial') } : undefined} />
    </Figure>
  );
}

function nextMonth(p: number): number {
  return p % 100 === 12 ? (Math.floor(p / 100) + 1) * 100 + 1 : p + 1;
}

// -- share_change ----------------------------------------------------------------------------------------------------

function ShareChangeFig({ items, spec, ctx, fid }: { items: ShareChange[]; spec?: MeasureSpec; ctx: Ctx; fid: string }) {
  const { lang, book } = ctx;
  const first = items[0];
  const lens = first.lens;
  const many = items.length > 1;
  const r = (m: ShareChange) => {
    const a = m.rows[0], b = m.rows[m.rows.length - 1];
    return { t0: a[0], s0: a[1], t1: b[0], s1: b[1], d: a[1] != null && b[1] != null ? b[1] - a[1] : null };
  };
  const product = mid(book.product(first.product, lang), lang);
  const supplier = book.econ(first.supplier, lang);
  let reading: string;
  let chart: ReactNode;
  if (!many) {
    const x = r(first);
    reading = t(lang, 'cases.read.shareChange', {
      supplier, supplierP: poss(supplier, lang), importer: book.econ(first.importer, lang),
      importerP: poss(book.econ(first.importer, lang), lang), product,
      v0: fs(x.s0, lang), p0: periodLabel(x.t0, lang, lens), v1: fs(x.s1, lang), p1: periodLabel(x.t1, lang, lens), d: fp(x.d, lang),
    });
    chart = <BarList ariaLabel={reading} max={Math.max(x.s0 ?? 0, x.s1 ?? 0) * 1.05 || 1}
      bars={first.rows.map(([p, s]) => ({ id: String(p), label: periodLabel(p, lang, lens), value: s, text: fs(s, lang) }))}
      colour="viz-1" />;
  } else {
    const parts = items.map((m) => `${cap(book.econ(m.importer, lang))} ${fs(r(m).s0, lang)} → ${fs(r(m).s1, lang)}`);
    const x = r(first);
    reading = t(lang, 'cases.read.shareChangeMany', {
      supplier, supplierP: poss(supplier, lang), product, p0: periodLabel(x.t0, lang, lens), p1: periodLabel(x.t1, lang, lens),
      list: list(parts, lang),
    });
    chart = <BarList diverging ariaLabel={reading}
      bars={items.map((m) => ({ id: m.importer, label: book.econ(m.importer, lang), value: r(m).d, text: fp(r(m).d, lang) }))} />;
  }
  const table: FigureTable = {
    columns: [
      col('importer', t(lang, 'cases.col.importer')), col('supplier', t(lang, 'cases.col.supplier')),
      col('s0', periodLabel(r(first).t0, lang, lens), true), col('s1', periodLabel(r(first).t1, lang, lens), true),
      col('d', t(lang, 'cases.col.pp'), true),
    ],
    rows: items.map((m): DataRow => {
      const x = r(m);
      return {
        id: m.importer + m.supplier,
        cells: { importer: book.econ(m.importer, lang), supplier: book.econ(m.supplier, lang), s0: fs(x.s0, lang), s1: fs(x.s1, lang), d: fp(x.d, lang) },
        sort: { s0: x.s0, s1: x.s1, d: x.d },
      };
    }),
    csv: [
      [t(lang, 'cases.col.importer'), t(lang, 'cases.col.supplier'), t(lang, 'cases.col.period'), t(lang, 'cases.col.shareFrac'), t(lang, 'cases.col.period'), t(lang, 'cases.col.shareFrac'), t(lang, 'cases.col.ppFrac')],
      ...items.map((m) => { const x = r(m); return [m.importer, m.supplier, x.t0, x.s0, x.t1, x.s1, x.d]; }),
    ],
    filename: `${fid}-share-change`,
  };
  return (
    <Figure lang={lang} title={title(spec, lang)} reading={reading} id={fid} table={table}
      notes={[spec?.note ? noteText(spec, lang) : null]}
      source={sourceLine(lang, { cite: ctx.cite, freq: first.freq, lens, rule: 'mirror' })}>
      {chart}
    </Figure>
  );
}

// -- top_exporters ---------------------------------------------------------------------------------------------------

function TopExportersFig({ items, spec, ctx, fid }: { items: TopExporters[]; spec?: MeasureSpec; ctx: Ctx; fid: string }) {
  const { lang, book } = ctx;
  const first = items[0];
  const byProduct = items.length > 1 && items.some((x) => x.product !== first.product);
  const byPeriod = items.length > 1 && !byProduct;
  const source = sourceLine(lang, { cite: ctx.cite, freq: first.freq, lens: first.lens, rule: 'mirror' });
  const notes = [spec?.note ? noteText(spec, lang) : null];

  const csvRows = items.flatMap((m) => m.rows.map(([i, s], k) => [m.product, m.t, k + 1, book.iso(i), s] as (string | number | null)[]));
  const table: FigureTable = {
    columns: [
      ...(byProduct ? [col('product', t(lang, 'cases.col.product'))] : []),
      ...(byPeriod ? [col('t', t(lang, 'cases.col.period'))] : []),
      col('rank', t(lang, 'cases.col.rank'), true), col('econ', t(lang, 'cases.col.exporter')),
      col('share', t(lang, 'cases.col.worldExpShare'), true),
    ],
    rows: items.flatMap((m) => {
      const rows = m.rows.map(([i, s], k) => ({ i, s, rank: k + 1 }));
      return rows.map((x): DataRow => ({
        id: `${m.product}-${m.t}-${x.i}`,
        cells: { product: book.product(m.product, lang), t: periodLabel(m.t, lang, m.lens), rank: x.rank, econ: book.node(x.i, lang), share: fs(x.s, lang) },
        sort: { share: x.s, rank: x.rank, t: m.t },
      }));
    }),
    csv: [[t(lang, 'cases.col.product'), t(lang, 'cases.col.period'), t(lang, 'cases.col.rank'), t(lang, 'cases.col.iso'), t(lang, 'cases.col.shareFrac')], ...csvRows],
    filename: `${fid}-exporters`,
  };

  if (byProduct) {
    // One bar per product: the five largest exporters in slots by position, Others in viz-context.
    const parts = items.map((m) => m.group_share != null
      ? t(lang, 'cases.te.group', { product: book.product(m.product, lang), v: fs(m.group_share, lang) })
      : t(lang, 'cases.te.top', { product: book.product(m.product, lang), econ: book.node(m.rows[0]?.[0] ?? -1, lang), v: fs(m.rows[0]?.[1], lang) }));
    const reading = first.group
      ? t(lang, 'cases.read.teGroup', { group: book.econ(first.group, lang), groupP: poss(book.econ(first.group, lang), lang), p: periodLabel(first.t, lang, first.lens), list: list(parts, lang) })
      : t(lang, 'cases.read.teProducts', { p: periodLabel(first.t, lang, first.lens), list: list(parts, lang) });
    return (
      <Figure lang={lang} title={title(spec, lang)} reading={reading} id={fid} table={table} notes={notes} source={source}>
        <div className="st-sharebars">
          {items.map((m) => (
            <ShareBar key={m.product} lang={lang} title={book.product(m.product, lang)}
              shares={m.rows.slice(0, 5).map(([i, s]) => ({ label: book.iso(i), share: s }))} />
          ))}
        </div>
      </Figure>
    );
  }

  if (byPeriod) {
    // The five largest of the first period across the periods, as lines.
    const periods = items.map((m) => m.t);
    const top = first.rows.slice(0, 5).map(([i]) => i);
    const shareAt = (m: TopExporters, i: number) => m.rows.find(([j]) => j === i)?.[1] ?? null;
    const series: LineSeries[] = top.map((i, k) => ({
      id: book.iso(i), label: book.node(i, lang), values: items.map((m) => shareAt(m, i)), colour: SLOTS[k] ?? 'viz-context',
    }));
    const lead = first.rows[0]?.[0] ?? -1;
    const last = items[items.length - 1];
    const union = [...new Set(items.flatMap((m) => m.rows.map(([i]) => i)))];
    const gains = union.map((i) => ({ i, d: (shareAt(last, i) ?? 0) - (shareAt(first, i) ?? 0) })).sort((a, b) => b.d - a.d);
    const reading = t(lang, 'cases.read.tePeriods', {
      product: mid(book.product(first.product, lang), lang), econ: book.node(lead, lang),
      v0: fs(shareAt(first, lead), lang), p0: periodLabel(first.t, lang, first.lens),
      v1: fs(shareAt(last, lead), lang), p1: periodLabel(last.t, lang, last.lens),
      gainer: book.node(gains[0].i, lang), d: fp(gains[0].d, lang),
    });
    return (
      <Figure lang={lang} title={title(spec, lang)} reading={reading} id={fid} table={table} notes={notes} source={source}>
        <LineChart t={periods} series={series} format={shareTick(lang)} zero ariaLabel={reading}
          ticks={periods.map((p) => ({ t: p, label: tickLabel(p, lang, false) }))} />
      </Figure>
    );
  }

  const m = first;
  const bars: Bar[] = m.rows.map(([i, s]) => ({ id: String(i), label: book.node(i, lang), value: s, text: fs(s, lang) }));
  let reading = t(lang, 'cases.read.teOne', {
    product: mid(book.product(m.product, lang), lang), p: periodLabel(m.t, lang, m.lens),
    econ: book.node(m.rows[0]?.[0] ?? -1, lang), v: fs(m.rows[0]?.[1], lang),
  });
  if (m.group && m.group_share != null) reading += ' ' + t(lang, 'cases.read.teGroupOne', { group: book.econ(m.group, lang), v: fs(m.group_share, lang) });
  return (
    <Figure lang={lang} title={title(spec, lang)} reading={reading} id={fid} table={table} notes={notes} source={source}>
      <BarList bars={bars} ariaLabel={reading} />
    </Figure>
  );
}

// -- korea_exposure --------------------------------------------------------------------------------------------------

function KoreaExposureFig({ m, items, spec, ctx, fid }: { m: Measured; items: KoreaExposure[]; spec?: MeasureSpec; ctx: Ctx; fid: string }) {
  const { lang, book } = ctx;
  const first = items[0];
  const nested = !!m.items?.some((x) => x.items);
  const bySupplier = items.some((x) => x.each?.supplier);
  const byProduct = items.some((x) => x.each?.product);
  const label = (x: KoreaExposure) => [
    byProduct ? book.product(x.product, lang) : null,
    bySupplier ? book.econ(x.supplier ?? '', lang) : null,
    items.some((y) => y.t !== first.t) ? periodLabel(x.t, lang, x.lens) : null,
  ].filter(Boolean).join(', ') || periodLabel(x.t, lang, x.lens);
  const product = mid(book.product(first.product, lang), lang);
  const supName = book.econ(first.supplier ?? '', lang);
  const source = sourceLine(lang, { cite: ctx.cite, freq: first.freq, lens: null, rule: 'mirror' });

  let reading: string;
  if (items.length === 1) {
    reading = first.supplier
      ? t(lang, 'cases.read.korOne', { supplier: book.econ(first.supplier, lang), product, v: fs(first.supplier_share, lang), p: periodLabel(first.t, lang, first.lens), w: fs(first.share_of_world_imports, lang) })
      : t(lang, 'cases.read.korTop', { product, econ: book.node(first.top_suppliers[0]?.[0] ?? -1, lang), v: fs(first.top_suppliers[0]?.[1], lang), p: periodLabel(first.t, lang, first.lens) });
  } else if (nested || bySupplier) {
    const sups = [...new Set(items.map((x) => x.supplier ?? ''))];
    const parts = sups.map((s) => {
      const xs = items.filter((x) => x.supplier === s);
      return `${book.econ(s, lang)} ${xs.map((x) => fs(x.supplier_share, lang)).join(' → ')}`;
    });
    reading = t(lang, 'cases.read.korSuppliers', { product, periods: list([...new Set(items.map((x) => periodLabel(x.t, lang, x.lens)))], lang), list: list(parts, lang) });
  } else {
    const parts = items.map((x) => t(lang, 'cases.te.item', { v: fs(x.supplier_share, lang), label: label(x) }));
    reading = t(lang, byProduct ? 'cases.read.korProducts' : 'cases.read.korPeriods', { supplier: supName, supplierP: poss(supName, lang), product, list: list(parts, lang) });
  }

  const table: FigureTable = {
    columns: [
      col('item', t(lang, 'cases.col.item')), col('supplier', t(lang, 'cases.col.supplier')),
      col('share', t(lang, 'cases.col.korImpShare'), true), col('world', t(lang, 'cases.col.korWorldShare'), true),
      col('top', t(lang, 'cases.col.topSuppliers')),
    ],
    rows: items.map((x, k): DataRow => ({
      id: String(k),
      cells: {
        item: label(x), supplier: book.econ(x.supplier ?? '', lang), share: fs(x.supplier_share, lang), world: fs(x.share_of_world_imports, lang),
        top: x.top_suppliers.map(([i, s]) => `${book.iso(i)} ${fs(s, lang)}`).join(', '),
      },
      sort: { share: x.supplier_share, world: x.share_of_world_imports },
    })),
    csv: [
      [t(lang, 'cases.col.product'), t(lang, 'cases.col.period'), t(lang, 'cases.col.supplier'), t(lang, 'cases.col.korImpShareFrac'), t(lang, 'cases.col.korWorldShareFrac'),
        ...[1, 2, 3, 4, 5].flatMap((k) => [t(lang, 'cases.col.topN', { n: k }), t(lang, 'cases.col.topNShare', { n: k })])],
      ...items.map((x) => [x.product, x.t, x.supplier ?? '', x.supplier_share ?? null, x.share_of_world_imports,
        ...[0, 1, 2, 3, 4].flatMap((k) => [x.top_suppliers[k] ? book.iso(x.top_suppliers[k][0]) : '', x.top_suppliers[k]?.[1] ?? null])]),
    ],
    filename: `${fid}-korea`,
  };

  // Each supplier × periods: the supplier's share as bars; otherwise Korea's top suppliers as one ShareBar per item.
  const chart = nested || (bySupplier && !byProduct)
    ? <BarList ariaLabel={reading} colour="viz-focus"
        bars={items.map((x, k) => ({ id: String(k), label: label(x), value: x.supplier_share ?? null, text: fs(x.supplier_share, lang) }))} />
    : (
      <div className="st-sharebars">
        {items.map((x, k) => (
          <ShareBar key={k} lang={lang} title={items.length > 1 ? label(x) : t(lang, 'cases.ke.top', { p: periodLabel(x.t, lang, x.lens) })}
            shares={x.top_suppliers.slice(0, 5).map(([i, s]) => ({ label: book.iso(i), share: s }))} />
        ))}
      </div>
    );
  return (
    <Figure lang={lang} title={title(spec, lang)} reading={reading} id={fid} table={table}
      notes={[spec?.note ? noteText(spec, lang) : null, items.some((x) => !x.filed) ? t(lang, 'cases.note.korNotFiled') : null]} source={source}>
      {chart}
    </Figure>
  );
}

// -- between_groups --------------------------------------------------------------------------------------------------

function BetweenGroupsFig({ m, spec, ctx, fid }: { m: BetweenGroups; spec?: MeasureSpec; ctx: Ctx; fid: string }) {
  const { lang, book } = ctx;
  const tt = m.rows.map((r) => r[0]);
  const A = book.econ(m.a, lang), B = book.econ(m.b, lang);
  const series: LineSeries[] = [
    { id: 'within_a', label: t(lang, 'cases.bg.within', { g: A }), values: m.rows.map((r) => r[1]), colour: 'viz-1' },
    { id: 'within_b', label: t(lang, 'cases.bg.within', { g: B }), values: m.rows.map((r) => r[2]), colour: 'viz-2' },
    { id: 'between', label: t(lang, 'cases.bg.between'), values: m.rows.map((r) => r[3]), colour: 'viz-3' },
  ];
  const bt = m.rows.map((r) => r[3]);
  const hiI = bt.reduce((a, _, i) => (bt[i] > bt[a] ? i : a), 0);
  const lens = m.freq === 'M' ? m.lens : null;
  let reading = t(lang, 'cases.read.between', {
    a: A, b: B, v0: fs(bt[0], lang), p0: periodLabel(tt[0], lang, lens), v1: fs(bt[bt.length - 1], lang), p1: periodLabel(tt[tt.length - 1], lang, lens),
  });
  if (hiI !== bt.length - 1 && hiI !== 0) reading += ' ' + t(lang, 'cases.read.peak', { v: fs(bt[hiI], lang), p: periodLabel(tt[hiI], lang, lens) });
  const table: FigureTable = {
    columns: [col('t', t(lang, 'cases.col.period')), ...series.map((s) => col(s.id, s.label, true))],
    rows: m.rows.map((r): DataRow => ({
      id: String(r[0]),
      cells: { t: periodLabel(r[0], lang, lens), within_a: fs(r[1], lang), within_b: fs(r[2], lang), between: fs(r[3], lang) },
      sort: { t: r[0], within_a: r[1], within_b: r[2], between: r[3] },
    })),
    csv: [[t(lang, 'cases.col.period'), ...series.map((s) => s.label)], ...m.rows.map((r) => [...r])],
    filename: `${fid}-blocs`,
  };
  return (
    <Figure lang={lang} title={title(spec, lang)} reading={reading} id={fid} table={table}
      notes={[spec?.note ? noteText(spec, lang) : null, t(lang, 'cases.note.shareOfWorld')]}
      source={sourceLine(lang, { cite: ctx.cite, freq: m.freq, lens, rule: 'mirror' })}>
      <LineChart t={tt} series={series} format={shareTick(lang)} zero ariaLabel={reading}
        ticks={periodTicks(tt, 8, (p) => tickLabel(p, lang, false))} />
    </Figure>
  );
}

// -- connector_scatter -----------------------------------------------------------------------------------------------

function ScatterFig({ m, spec, ctx, fid, multi }: { m: ConnectorScatter; spec?: MeasureSpec; ctx: Ctx; fid: string; multi: boolean }) {
  const { lang, book } = ctx;
  const A = book.econ(m.a, lang), B = book.econ(m.b, lang);
  const aP = poss(A, lang), bP = poss(B, lang);
  const win = (w: [number, number]) => (w[0] === w[1] ? periodLabel(w[0], lang) : `${w[0]}–${w[1]}`);
  const pts = m.points.filter((p) => p[1] != null && p[2] != null);
  const byA = [...pts].sort((a, b) => (b[1] as number) - (a[1] as number));
  const top = byA[0];
  const reading = top ? t(lang, 'cases.read.scatter', {
    a: A, b: B, aP, bP, econ: book.node(top[0], lang), da: fp(top[1], lang), db: fp(top[2], lang), w0: win(m.w0), w1: win(m.w1),
  }) : '';
  const labelled = new Set(pts.slice(0, 9).map((p) => p[0]));
  const heading = multi ? `${title(spec, lang)}: ${book.product(m.product, lang)}` : title(spec, lang);
  const table: FigureTable = {
    columns: [col('econ', t(lang, 'cases.col.economy')), col('da', t(lang, 'cases.sc.x', { a: A, aP }), true),
      col('db', t(lang, 'cases.sc.y', { b: B, bP }), true), col('s', t(lang, 'cases.sc.share', { a: A, aP, w: win(m.w1) }), true)],
    rows: pts.map((p): DataRow => ({
      id: String(p[0]),
      cells: { econ: book.node(p[0], lang), da: fp(p[1], lang), db: fp(p[2], lang), s: fs(p[3], lang) },
      sort: { da: p[1], db: p[2], s: p[3] },
    })),
    csv: [[t(lang, 'cases.col.iso'), t(lang, 'cases.sc.xFrac', { a: A, aP }), t(lang, 'cases.sc.yFrac', { b: B, bP }), t(lang, 'cases.sc.shareFrac', { a: A, aP })],
      ...pts.map((p) => [book.iso(p[0]), p[1], p[2], p[3]])],
    filename: `${fid}-connectors`,
  };
  return (
    <Figure lang={lang} title={heading} reading={reading} id={fid} table={table}
      notes={[spec?.note ? noteText(spec, lang) : null, t(lang, 'cases.note.scatter', { w0: win(m.w0), w1: win(m.w1) })]}
      source={sourceLine(lang, { cite: ctx.cite, freq: m.freq, lens: null, rule: 'mirror' })}>
      <Scatter ariaLabel={reading} format={ppTick(lang)} xLabel={t(lang, 'cases.sc.x', { a: A, aP })} yLabel={t(lang, 'cases.sc.y', { b: B, bP })}
        points={pts.map((p) => ({ id: String(p[0]), label: book.node(p[0], lang), x: p[1] as number, y: p[2] as number, size: p[3] ?? 0, labelled: labelled.has(p[0]) }))} />
    </Figure>
  );
}

// -- fragility -------------------------------------------------------------------------------------------------------

function FragilityRankFig({ m, spec, ctx, fid }: { m: FragilityRank; spec?: MeasureSpec; ctx: Ctx; fid: string }) {
  const { lang, book } = ctx;
  const L = m.latest;
  const rows = L.rows;
  const high = rows.filter((r) => (r[4] ?? 0) > 0.25).length;
  const r0 = rows[0];
  const reading = r0 ? t(lang, 'cases.read.fragility', {
    year: L.year, stage: book.product(r0[0], lang), h: (r0[4] ?? 0).toFixed(2), econ: book.node(r0[6] ?? -1, lang), v: fs(r0[7], lang), n: high, total: rows.length,
  }) : '';
  const shown = rows.slice(0, 15);
  const table: FigureTable = {
    columns: [col('rank', t(lang, 'cases.col.rank'), true), col('stage', t(lang, 'cases.col.stage')), col('hhi', t(lang, 'cases.col.hhi'), true),
      col('top', t(lang, 'cases.col.topExporter'))],
    rows: rows.map((r, k): DataRow => ({
      id: r[0],
      cells: {
        rank: k + 1, stage: book.product(r[0], lang), hhi: r[4] != null ? r[4].toFixed(3) : '–',
        top: r[6] != null ? `${book.node(r[6], lang)} ${fs(r[7], lang)}` : '–',
      },
      sort: { rank: k + 1, hhi: r[4] },
    })),
    csv: [[t(lang, 'cases.col.product'), t(lang, 'cases.col.hhi'), t(lang, 'cases.col.hhiSup'), t(lang, 'cases.col.topExporterIso'), t(lang, 'cases.col.topShareFrac')],
    ...rows.map((r) => [r[0], r[4], r[5], r[6] != null ? book.iso(r[6]) : '', r[7]])],
    filename: `${fid}-fragility-${L.year}`,
  };
  return (
    <Figure lang={lang} title={title(spec, lang)} reading={reading} id={fid} table={table}
      notes={[spec?.note ? noteText(spec, lang) : null, t(lang, 'cases.note.hhi', { n: shown.length, total: rows.length })]}
      source={sourceLine(lang, { cite: ctx.cite, freq: 'A', lens: null, rule: 'mirror' })}>
      <BarList ariaLabel={reading} max={1}
        bars={shown.map((r) => ({ id: r[0], label: book.product(r[0], lang), value: r[4], text: r[4] != null ? r[4].toFixed(2) : '–' }))} />
    </Figure>
  );
}

function FragilityKoreaFig({ m, spec, ctx, fid }: { m: FragilityKorea; spec?: MeasureSpec; ctx: Ctx; fid: string }) {
  const { lang } = ctx;
  const n = m.years.length - 1;
  const reading = t(lang, 'cases.read.fragKor', { year: m.years[n], k: (m.kor_score[n] ?? 0).toFixed(3), w: (m.world_score[n] ?? 0).toFixed(3), y0: m.years[0], k0: (m.kor_score[0] ?? 0).toFixed(3) });
  const series: LineSeries[] = [
    { id: 'kor', label: t(lang, 'cases.frag.kor'), values: m.kor_score, colour: 'viz-focus', focus: true },
    { id: 'world', label: t(lang, 'cases.frag.world'), values: m.world_score, colour: 'viz-context' },
  ];
  const table: FigureTable = {
    columns: [col('t', t(lang, 'cases.col.period')), col('kor', t(lang, 'cases.frag.kor'), true), col('world', t(lang, 'cases.frag.world'), true)],
    rows: m.years.map((y, i): DataRow => ({ id: String(y), cells: { t: y, kor: m.kor_score[i]?.toFixed(3) ?? '–', world: m.world_score[i]?.toFixed(3) ?? '–' }, sort: { t: y, kor: m.kor_score[i], world: m.world_score[i] } })),
    csv: [[t(lang, 'cases.col.period'), t(lang, 'cases.frag.kor'), t(lang, 'cases.frag.world')], ...m.years.map((y, i) => [y, m.kor_score[i], m.world_score[i]])],
    filename: `${fid}-fragility-korea`,
  };
  return (
    <Figure lang={lang} title={title(spec, lang)} reading={reading} id={fid} table={table}
      notes={[spec?.note ? noteText(spec, lang) : null, t(lang, 'cases.note.fragKor')]}
      source={sourceLine(lang, { cite: ctx.cite, freq: 'A', lens: null, rule: 'mirror' })}>
      <LineChart t={m.years} series={series} format={(v) => v.toFixed(2)} ariaLabel={reading}
        ticks={periodTicks(m.years, 8, (p) => String(p))} />
    </Figure>
  );
}

// -- movers ----------------------------------------------------------------------------------------------------------

export function MoversFig({ m, ctx, fid, heading, lens }: { m: Movers; ctx: Ctx; fid: string; heading?: string; lens?: Lens | null }) {
  const { lang, book } = ctx;
  const up = m.up ?? [], down = m.down ?? [];
  const product = mid(book.product(m.product, lang), lang);
  const ln = lens ?? m.lens ?? null;
  const freq = m.freq ?? ((m.t ?? 0) > 9999 ? 'M' : 'A');
  const base = m.base != null ? periodLabel(m.base, lang, ln) : '', now = m.t != null ? periodLabel(m.t, lang, ln) : '';
  const parts: string[] = [];
  if (up[0]) parts.push(t(lang, 'cases.mv.up', { econ: book.node(up[0][0], lang), d: fp(up[0][1], lang) }));
  if (down[0]) parts.push(t(lang, 'cases.mv.down', { econ: book.node(down[0][0], lang), d: fp(down[0][1], lang) }));
  let reading = t(lang, 'cases.read.movers', { product, base, now, list: parts.join(lang === 'ko' ? ', ' : '; ') });
  if (m.world_change != null) reading += ' ' + t(lang, 'cases.read.moversWorld', { v: fc(m.world_change, lang) });
  const rows = [...up, ...[...down].reverse()];
  const table: FigureTable = {
    columns: [col('econ', t(lang, 'cases.col.exporter')), col('d', t(lang, 'cases.col.ppWorldExp'), true), col('s', t(lang, 'cases.col.worldExpShareAt', { p: now }), true)],
    rows: rows.map((r): DataRow => ({ id: String(r[0]), cells: { econ: book.node(r[0], lang), d: fp(r[1], lang), s: fs(r[2], lang) }, sort: { d: r[1], s: r[2] } })),
    csv: [[t(lang, 'cases.col.iso'), t(lang, 'cases.col.ppWorldExpFrac'), t(lang, 'cases.col.worldExpShareAtFrac', { p: now })], ...rows.map((r) => [book.iso(r[0]), r[1], r[2]])],
    filename: `${fid}-movers`,
  };
  return (
    <Figure lang={lang} title={heading || t(lang, 'cases.head.movers', { product })} reading={reading} id={fid} table={table}
      notes={[t(lang, 'cases.note.movers', { base, now })]}
      source={sourceLine(lang, { cite: ctx.cite, freq, lens: ln, rule: 'mirror' })}>
      {rows.length ? <BarList diverging ariaLabel={reading}
        bars={rows.map((r) => ({ id: String(r[0]), label: book.node(r[0], lang), value: r[1], text: fp(r[1], lang) }))} />
        : <p className="lr-caption">{t(lang, 'cases.mv.none')}</p>}
    </Figure>
  );
}
