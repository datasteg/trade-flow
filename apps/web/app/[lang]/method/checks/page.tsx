import type { Metadata } from 'next';
import { DataTable, StatTile, StatTiles, type DataColumn, type DataRow } from '@larch/ui';
import { CoverageChart } from '@/components/method/CoverageChart';
import {
  day, exploreChecksHref, productName, readMeta, STATUSES, tryData,
  type BuildStats, type Check, type ChecksIndex, type MetaProduct, type PapersCheck, type ProductChecks, type Status, type WindowsSummary,
} from '@/components/method/data';
import { P } from '@/components/method/Rich';
import { StatusWord } from '@/components/method/StatusWord';
import { formatNumber, formatPercentChange, formatPeriod, formatShare, formatUSD, t, type Lang, type StringKey } from '@/lib/i18n';
import { langOf } from '@/lib/page';
import { pageMeta } from '@/lib/seo';
import '../method.css';
import './checks.css';

// /method/checks: every check of the ladder in one table (tier, what, threshold, last run, counts by status), the
// way admin's Services page lists the apps; then tier 0 and tier 1 per product with links to the explorer's Checks
// drawer, the validators, the coverage line and the record count. Read from data/checks/ at build time.

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langOf(params);
  const index = await tryData<ChecksIndex>('checks/index.json');
  const run = index ? ` ${t(lang, 'method.ck.metaRun', { run: day(index.run_at, lang) })}` : '';
  return pageMeta(lang, { path: '/method/checks', title: `${t(lang, 'common.nav.method')} · ${t(lang, 'common.nav.checks')}`, description: `${t(lang, 'method.ck.dek')}${run}` });
}

/** Worse statuses sort first. */
const RANK: Record<Status, number> = { fail: 0, watch: 1, pass: 2, info: 3, 'not run': 4 };

function find(pc: ProductChecks | null, id: string): Check | undefined {
  return pc?.tiers.flatMap((x) => x.checks).find((c) => c.id === id);
}

/** The worst monthly-sum row: [economy ISO3, year, gap]. */
function worstGap(c: Check | undefined): [string, number, number] | null {
  const rows = (c?.rows ?? []) as [string, number, number][];
  let w: [string, number, number] | null = null;
  for (const r of rows) if (typeof r[2] === 'number' && (!w || Math.abs(r[2]) > Math.abs(w[2]))) w = r;
  return w;
}

export default async function Checks({ params }: { params: Promise<{ lang: string }> }) {
  const lang: Lang = await langOf(params);
  const [meta, index, papers, build] = await Promise.all([
    readMeta(),
    tryData<ChecksIndex>('checks/index.json'),
    tryData<PapersCheck>('checks/papers.json'),
    tryData<BuildStats>('build.json'),
  ]);
  const num = (v: number | null | undefined) => formatNumber(v, lang);
  const run = index ? day(index.run_at, lang) : '–';

  // Products in the site's order (all goods, chapters, baskets, chain stages), those with a checks file.
  const ids = new Set(index?.rows.map((r) => r[0]) ?? []);
  const products = meta.products.filter((p) => ids.has(p.id));
  const files = await Promise.all(products.map((p) => tryData<ProductChecks>(`checks/${p.slug}.json`)));
  const chainName = new Map<string, string>();
  const chains = await tryData<{ chains: { id: string; en: string; ko: string }[] }>('chains/index.json');
  for (const c of chains?.chains ?? []) chainName.set(c.id, lang === 'ko' ? c.ko : c.en);

  const ms = index?.counts.monthly_sum ?? {};
  const msTotal = STATUSES.reduce((s, k) => s + (ms[k] ?? 0), 0);
  const title = (ms.fail ?? 0) > 0
    ? t(lang, 'method.ck.title', { fail: num(ms.fail), n: num(msTotal) })
    : t(lang, 'method.ck.title.clean');

  // Table 1: every check.
  const defs = Object.entries(index?.checks ?? {}).sort((a, b) => a[1].tier - b[1].tier);
  const checkRows = [
    ...defs.map(([id, d]) => ({
      id, tier: d.tier, what: lang === 'ko' ? d.ko : d.en, threshold: lang === 'ko' ? d.threshold.ko : d.threshold.en,
      run, counts: index?.counts[id] ?? {},
    })),
    ...(papers ? [{
      id: 'papers', tier: 5, what: t(lang, 'method.ck.papers'), threshold: t(lang, 'method.ck.papers.threshold'),
      run: day(papers.run_at, lang),
      counts: { pass: papers.anchors.filter((a) => a.verified).length, fail: papers.anchors.filter((a) => !a.verified).length } as Partial<Record<Status, number>>,
    }] : []),
  ];
  const totals = Object.fromEntries(STATUSES.map((s) => [s, defs.reduce((n, [id]) => n + (index?.counts[id]?.[s] ?? 0), 0)])) as Record<Status, number>;

  // Table 2: per product.
  const t1 = new Map<string, { check: string; status: Status; subject: string | null }[]>();
  for (const [p, tier, check, status, subject] of index?.rows ?? []) {
    if (tier !== 1) continue;
    t1.set(p, [...(t1.get(p) ?? []), { check, status, subject }]);
  }
  const kindLabel = (p: MetaProduct) => p.kind === 'stage'
    ? t(lang, 'method.ck.kind.stage', { chain: chainName.get(p.chain ?? '') ?? p.chain ?? '', n: p.stage ?? '' })
    : t(lang, `method.ck.kind.${p.kind}` as StringKey);
  let mirrorPeriod: [number, number] | null = null;

  const columns: DataColumn[] = [
    { key: 'product', label: t(lang, 'method.ck.col.product'), sortable: true },
    { key: 'kind', label: t(lang, 'method.ck.col.kind'), sortable: true },
    { key: 'sum', label: t(lang, 'method.ck.col.sum'), sortable: true },
    { key: 'gap', label: t(lang, 'method.ck.col.gap'), num: true, sortable: true },
    { key: 'mirror', label: t(lang, 'method.ck.col.mirror'), sortable: true },
    { key: 't1', label: t(lang, 'method.ck.col.t1'), sortable: true },
    { key: 'open', label: t(lang, 'method.ck.col.open') },
  ];
  // Cell elements carry keys: React warns about unkeyed server elements rendered inside the client DataTable.
  const rows: DataRow[] = products.map((p, i) => {
    const pc = files[i];
    const sum = find(pc, 'monthly_sum');
    const mir = find(pc, 'mirror_monthly');
    if (!mirrorPeriod && mir?.period) mirrorPeriod = mir.period;
    const w = worstGap(sum);
    const mRows = (mir?.rows ?? []) as [string, string, number, number][];
    const band = mir?.band ?? [0.8, 1.25];
    const out = mRows.filter((r) => r[3] < band[0] || r[3] > band[1]).length;
    const tier1 = t1.get(p.id) ?? [];
    const korea = tier1.find((x) => x.check === 'korea_index');
    const us = tier1.filter((x) => x.check === 'us_imports');
    const usWorst = us.length ? us.reduce((a, b) => (RANK[b.status] < RANK[a.status] ? b : a)).status : null;
    const usCounts = STATUSES.filter((s) => us.some((x) => x.status === s))
      .map((s) => {
        const n = num(us.filter((x) => x.status === s).length), w = t(lang, `method.status.${s}`).toLowerCase();
        return lang === 'ko' ? `${w} ${n}` : `${n} ${w}`;
      }).join(' · ');
    const name = productName(p, lang);
    const t1rank = Math.min(korea ? RANK[korea.status] : 9, usWorst ? RANK[usWorst] : 9);
    return {
      id: p.id,
      sort: {
        product: name, kind: i, sum: sum ? RANK[sum.status] : 9, gap: w ? Math.abs(w[2]) : null,
        mirror: mir ? (mRows.length ? -out / mRows.length : 9) : 9, t1: t1rank === 9 ? null : t1rank,
      },
      cells: {
        product: <span key="product" className="ck-prod">{name}</span>,
        kind: <span key="kind" className="ck-kind">{kindLabel(p)}</span>,
        sum: sum ? <StatusWord key="sum" lang={lang} status={sum.status} /> : '–',
        gap: w ? t(lang, 'method.ck.gap.at', { gap: formatPercentChange(w[2], lang, { decimals: 1 }), iso: w[0], year: w[1] }) : '–',
        mirror: mir ? (
          <StatusWord key="mirror" lang={lang} status={mir.status}>
            {mRows.length ? t(lang, 'method.ck.mirror.out', { o: num(out), n: num(mRows.length) }) : t(lang, 'method.ck.mirror.none')}
          </StatusWord>
        ) : '–',
        t1: tier1.length ? (
          <span key="t1" className="ck-t1">
            {korea ? <StatusWord key="korea" lang={lang} status={korea.status}>{t(lang, 'method.ck.t1.korea')}</StatusWord> : null}
            {usWorst ? <StatusWord key="us" lang={lang} status={usWorst}>{`${t(lang, 'method.ck.t1.us', { n: num(us.length) })}: ${usCounts}`}</StatusWord> : null}
          </span>
        ) : <span key="t1" className="mt-muted">–</span>,
        open: (
          <a key="open" className="ck-open" href={exploreChecksHref(lang, p.id)} aria-label={t(lang, 'method.ck.open.aria', { name })}>
            {t(lang, 'method.ck.open')}
          </a>
        ),
      },
    };
  });
  const mp = mirrorPeriod as [number, number] | null;

  const valName = (id: string, what: string) => {
    const key = `method.val.${id}` as StringKey;
    const s = t(lang, key);
    return s === key ? what : s;
  };
  const fetched = index?.validators.filter((v) => v.fetched).length ?? 0;

  return (
    <div className="page page--doc ck">
      <header className="ck-head">
        <p className="lr-kicker">{t(lang, 'method.ck.kicker')}</p>
        <h1 className="page__title">{title}</h1>
        <p className="page__lede">{t(lang, 'method.ck.dek')}</p>
      </header>

      <StatTiles className="ck-tiles">
        <StatTile label={t(lang, 'method.ck.tile.products')} value={num(products.length)} meta={t(lang, 'method.ck.tile.products.meta')} />
        <StatTile label={t(lang, 'method.ck.tile.run')} value={run} meta={t(lang, 'method.ck.tile.run.meta')} />
        <StatTile label={t(lang, 'method.ck.val.h')} value={`${num(fetched)} / ${num(index?.validators.length ?? 0)}`}
          meta={t(lang, 'method.ck.tile.val.meta')} />
        <StatTile label={t(lang, 'method.ck.tile.records')} value={num(meta.records.originals)}
          meta={t(lang, 'method.ck.tile.records.meta', { budget: num(meta.records.budget), line: num(meta.records.line) })} />
      </StatTiles>

      <section className="ck-sec" aria-labelledby="ck-all">
        <h2 id="ck-all">{t(lang, 'method.ck.all.h')}</h2>
        <p className="ck-lede">{t(lang, 'method.ck.all.lede')}</p>
        <div className="lr-tablewrap">
          <table className="lr-table ck-table">
            <caption>{t(lang, 'method.ck.all.caption', { run })}</caption>
            <thead>
              <tr>
                <th scope="col" className="num">{t(lang, 'method.ck.col.tier')}</th>
                <th scope="col">{t(lang, 'method.ck.col.check')}</th>
                <th scope="col">{t(lang, 'method.ck.col.threshold')}</th>
                <th scope="col">{t(lang, 'method.ck.col.run')}</th>
                {STATUSES.map((s) => <th key={s} scope="col" className="num"><StatusWord lang={lang} status={s} /></th>)}
              </tr>
            </thead>
            <tbody>
              {checkRows.map((r) => (
                <tr key={r.id}>
                  <td className="num">{r.tier}</td>
                  <td className="ck-what">{r.what}</td>
                  <td className="ck-threshold">{r.threshold}</td>
                  <td className="ck-nowrap">{r.run}</td>
                  {STATUSES.map((s) => {
                    const v = r.counts[s] ?? 0;
                    return <td key={s} className={v ? 'num ck-count' : 'num ck-zero'}>{num(v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td />
                <th scope="row" colSpan={3} className="ck-total">{t(lang, 'method.ck.total')}</th>
                {STATUSES.map((s) => <td key={s} className="num ck-count">{num(totals[s])}</td>)}
              </tr>
            </tfoot>
          </table>
        </div>
      </section>

      <section className="ck-sec" aria-labelledby="ck-prod">
        <h2 id="ck-prod">{t(lang, 'method.ck.prod.h')}</h2>
        <p className="ck-lede">{t(lang, 'method.ck.prod.lede', { year: meta.last.A })}</p>
        <DataTable className="ck-prodtable" columns={columns} rows={rows}
          caption={t(lang, 'method.ck.prod.caption', {
            p0: mp ? formatPeriod(mp[0], lang) : '–', p1: mp ? formatPeriod(mp[1], lang) : '–', run,
          })} />
      </section>

      <section className="ck-sec" aria-labelledby="ck-val">
        <h2 id="ck-val">{t(lang, 'method.ck.val.h')}</h2>
        <p className="ck-lede">{t(lang, 'method.ck.val.lede')}</p>
        <div className="lr-tablewrap">
          <table className="lr-table ck-table">
            <caption>{t(lang, 'method.ck.val.caption', { run })}</caption>
            <thead>
              <tr>
                <th scope="col">{t(lang, 'method.ck.val.col.id')}</th>
                <th scope="col">{t(lang, 'method.ck.val.col.what')}</th>
                <th scope="col">{t(lang, 'method.ck.val.col.last')}</th>
                <th scope="col">{t(lang, 'method.ck.val.col.status')}</th>
              </tr>
            </thead>
            <tbody>
              {(index?.validators ?? []).map((v) => (
                <tr key={v.id}>
                  <td><code className="ck-id">{v.id}</code></td>
                  <td>{valName(v.id, v.what)}</td>
                  <td className="ck-nowrap">{v.last ? formatPeriod(v.last, lang) : '–'}</td>
                  <td>
                    <StatusWord lang={lang} status={v.fetched ? 'pass' : 'not run'}>
                      {t(lang, v.fetched ? 'method.ck.val.yes' : 'method.ck.val.no')}
                    </StatusWord>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {index?.windows?.total ? <WindowsChecks lang={lang} w={index.windows} /> : null}

      <section className="ck-sec ck-narrow" aria-labelledby="ck-cov">
        <h2 id="ck-cov">{t(lang, 'method.ck.cov.h')}</h2>
        <CoverageChart lang={lang} coverage={meta.coverage.M} reporters={meta.reporters.M}
          from={(Math.floor(meta.complete.M / 100) - 1) * 100 + 1} to={meta.last.M} complete={meta.complete.M}
          built={day(meta.layer_built.M, lang)} />
      </section>

      <section className="ck-sec ck-narrow" aria-labelledby="ck-rec">
        <h2 id="ck-rec">{t(lang, 'method.ck.rec.h')}</h2>
        <div className="lr-prose">
          <P text={t(lang, 'method.ck.rec.p', {
            originals: num(meta.records.originals), budget: num(meta.records.budget), line: num(meta.records.line), lang,
          })} />
          {build ? (
            <P text={t(lang, 'method.ck.build.p', {
              files: num(build.files), size: `${formatNumber(build.bytes / 1e6, lang)} MB`,
              min: formatNumber(build.sec / 60, lang, { decimals: 1 }), built: day(build.built_at, lang),
            })} />
          ) : null}
        </div>
      </section>
    </div>
  );
}

/** The monthly explorer's tier-0 diagnostics: the timing share, the splice backtest for all goods by window
 *  length and importer size, the medians over the products, and the single-month guard. */
function WindowsChecks({ lang, w }: { lang: Lang; w: WindowsSummary }) {
  const tot = w.total!;
  const pc = (v: number | null | undefined) => (v == null ? '–' : formatShare(v / 100, lang, { decimals: 1 }));
  const num = (v: number | null | undefined) => formatNumber(v, lang);
  const q = tot.size_quartiles_usd;
  const sizeName = (k: string) => (k === 'all' ? t(lang, 'method.ck.w.size.all')
    : t(lang, `method.ck.w.size.${k}` as StringKey, { a: formatUSD(q[0] ?? 0, lang), b: formatUSD(q[1] ?? 0, lang), c: formatUSD(q[2] ?? 0, lang) }));
  return (
    <section className="ck-sec" aria-labelledby="ck-win">
      <h2 id="ck-win">{t(lang, 'method.ck.w.h')}</h2>
      <div className="lr-prose">
        <P text={t(lang, 'method.ck.w.timing', {
          v3: formatShare(tot.timing.share_w3 ?? 0, lang), v12: formatShare(tot.timing.share_w12 ?? 0, lang), n: num(tot.timing.flows),
          med: formatShare(w.timing_share_median ?? 0, lang), products: num(w.products),
          p0: formatPeriod(tot.months[0], lang), p1: formatPeriod(tot.months[1], lang),
        })} />
        <P text={t(lang, 'method.ck.w.backtest.lede')} />
      </div>
      <div className="lr-tablewrap">
        <table className="lr-table ck-table">
          <caption>{t(lang, 'method.ck.w.backtest.caption', { p0: formatPeriod(tot.months[0], lang), p1: formatPeriod(tot.months[1], lang) })}</caption>
          <thead>
            <tr>
              <th scope="col">{t(lang, 'method.ck.w.col.w')}</th>
              <th scope="col">{t(lang, 'method.ck.w.col.size')}</th>
              <th scope="col" className="num">{t(lang, 'method.ck.w.col.n')}</th>
              <th scope="col" className="num">{t(lang, 'method.ck.w.col.splice')}</th>
              <th scope="col" className="num">{t(lang, 'method.ck.w.col.window')}</th>
              <th scope="col" className="num">{t(lang, 'method.ck.w.col.partner')}</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(tot.backtest).flatMap(([wl, cells]) => Object.entries(cells).map(([k, c]) => (
              <tr key={`${wl}-${k}`}>
                <td>{t(lang, 'explore.w.window', { w: wl })}</td>
                <td>{sizeName(k)}</td>
                <td className="num">{num(c.splice.n)}</td>
                <td className="num">{pc(c.splice.mdape)} <span className="mt-muted">({pc(c.splice.p90)})</span></td>
                <td className="num">{pc(c.splice_window.mdape)} <span className="mt-muted">({pc(c.splice_window.p90)})</span></td>
                <td className="num">{pc(c.partner.mdape)} <span className="mt-muted">({pc(c.partner.p90)})</span></td>
              </tr>
            )))}
          </tbody>
        </table>
      </div>
      <div className="lr-prose">
        <P text={t(lang, 'method.ck.w.median', {
          products: num(w.products),
          s3: pc(w.backtest_median['3']?.splice_mdape), p3: pc(w.backtest_median['3']?.partner_mdape),
          s12: pc(w.backtest_median['12']?.splice_mdape), p12: pc(w.backtest_median['12']?.partner_mdape),
        })} />
        <P text={t(lang, 'method.ck.w.guard', {
          n: num(w.leak_tested), k: num(w.leaks), d12: formatShare(tot.dropped_share['12'] ?? 0, lang, { decimals: 1 }),
          d3: formatShare(tot.dropped_share['3'] ?? 0, lang, { decimals: 1 }), b: num(tot.benchmark.pair_years),
        })} />
      </div>
    </section>
  );
}
