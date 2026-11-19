import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { TrailRule } from '@larch/ui';
import { CoverageChart } from '@/components/method/CoverageChart';
import { day, readMeta, STATUSES, tryData, type ChecksIndex, type Status } from '@/components/method/data';
import { P, rich } from '@/components/method/Rich';
import { membersOn, monthRange, today, type GroupsFile } from '@larch/net/core';
import { formatNumber, formatPercentChange, formatPeriod, formatShare, t, type Lang, type StringKey } from '@/lib/i18n';
import { langOf } from '@/lib/page';
import { pageMeta } from '@/lib/seo';
import './method.css';

// The method page: how the numbers are made, in reading width with serif headings. Every figure in the prose comes
// from the data files (meta.json, the all-goods snapshot of the last complete year, the checks index, China's chip
// exports in nodes/W/B-chips_ic.json and the groupings in groups/memberships.json).

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const lang = await langOf(params);
  const meta = await readMeta();
  return pageMeta(lang, {
    path: '/method', title: t(lang, 'common.nav.method'),
    description: `${t(lang, 'method.dek')} ${t(lang, 'method.source.line', { built: day(meta.built_at, lang) })}`,
  });
}

interface SnapTot { tot: { nodes: number; edges: number; density: number; imp_rep: number } }
interface NodeLens { t: number[]; ids: number[]; x: (number | null)[][] }

const SECTIONS = [
  ['standard', 'method.std.h'], ['data', 'method.data.h'], ['mirror', 'method.mirror.h'], ['coverage', 'method.cov.h'], ['hs', 'method.hs.h'],
  ['lenses', 'method.lens.h'], ['monthly-explore', 'method.mx.h'], ['chains', 'method.chains.h'], ['blind', 'method.blind.h'], ['network', 'method.net.h'],
  ['two-way', 'method.tw.h'], ['groups', 'method.groups.h'], ['checks', 'method.ladder.h'], ['licence', 'method.lic.h'], ['address', 'method.hash.h'], ['cite', 'method.cite.h'],
] as const satisfies readonly (readonly [string, StringKey])[];

// The explorers' hash keys (design book 04-Explorer-layout, plus the strip, the table view, the drawer tab and the
// monthly explorer's window keys, as components/explore/state.ts reads them). Defaults in backticks are values.
const HASH: [string, StringKey, string | StringKey][] = [
  ['t', 'method.hash.t', 'method.hash.t.d'],
  ['base', 'method.hash.base', 'method.hash.base.d'],
  ['p', 'method.hash.p', '`TOTAL`'],
  ['m', 'method.hash.m', '`mirror`'],
  ['l', 'method.hash.l', '`map`'],
  ['c', 'method.hash.c', '`region`'],
  ['s', 'method.hash.s', '`total`'],
  ['sc', 'method.hash.sc', '`fixed`'],
  ['blocs', 'method.hash.blocs', '`EU,ASEAN,USMCA`'],
  ['club', 'method.hash.club', '`G7`'],
  ['custom', 'method.hash.custom', 'method.hash.none'],
  ['mt', 'method.hash.mt', '`0`'],
  ['k', 'method.hash.k', '`2`'],
  ['min', 'method.hash.min', '`0.0002`'],
  ['lab', 'method.hash.lab', '`25`'],
  ['focus', 'method.hash.focus', 'method.hash.none'],
  ['flow', 'method.hash.flow', 'method.hash.none'],
  ['strip', 'method.hash.strip', '`world`'],
  ['tbl', 'method.hash.tbl', '`0`'],
  ['tab', 'method.hash.tab', '`main`'],
  ['w', 'method.hash.w', '`12`'],
  ['cmp', 'method.hash.cmp', 'method.hash.cmp.d'],
  ['est', 'method.hash.est', '`1`'],
];

/** The economy of the two-readings example: its chip exports in February 2023 as 3- and 12-month sums. */
const LENS_EXAMPLE = 'CHN';

/** An economy's change at `period` against the window ending 12 months earlier, in one window length of
 *  nodes/W/<product>.json, or null. The windows skip January (and April for 3 months), so the base is found by month,
 *  never by position. */
function yoy(lens: NodeLens | undefined, node: number, period: number): number | null {
  if (!lens) return null;
  const j = lens.ids.indexOf(node), i = lens.t.indexOf(period), k = lens.t.indexOf(period - 100);
  if (j < 0 || i < 0 || k < 0) return null;
  const a = lens.x[j][i], b = lens.x[j][k];
  return a != null && b ? a / b - 1 : null;
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-sec" aria-labelledby={`${id}-h`}>
      <h2 id={`${id}-h`}>{title}</h2>
      {children}
    </section>
  );
}

export default async function Method({ params }: { params: Promise<{ lang: string }> }) {
  const lang: Lang = await langOf(params);
  const meta = await readMeta();
  const [snap, checks, chips, groups] = await Promise.all([
    tryData<SnapTot>(`snap/A/TOTAL/${meta.complete.A}.json`),
    tryData<ChecksIndex>('checks/index.json'),
    tryData<Record<string, NodeLens | string>>('nodes/W/B-chips_ic.json'),
    tryData<GroupsFile>('groups/memberships.json'),
  ]);

  const total = meta.products.find((p) => p.id === 'TOTAL');
  const kinds = (k: string) => meta.products.filter((p) => p.kind === k).length;
  const built = day(meta.built_at, lang);
  const num = (v: number | null | undefined) => formatNumber(v, lang);
  const yA = meta.complete.A;
  const rep = (y: number) => num(meta.reporters.A[String(y)]);

  // One economy's chips, Feb 2023, on this site's layer (3- and 12-month sums); no single month is stored for an economy.
  const ex = meta.nodes.findIndex((n) => n.id === LENS_EXAMPLE);
  const siteM = yoy(chips?.['3'] as NodeLens | undefined, ex, 202302);
  const siteL = yoy(chips?.['12'] as NodeLens | undefined, ex, 202302);
  // the blocs and clubs, with their members on the build date
  const asOf = today();
  const dated = groups ? [...groups.schemes.bloc, ...groups.schemes.club].map((k) => ({ k, g: groups.groups[k] })).filter((x) => x.g) : [];
  const pc = (v: number | null) => (v == null ? t(lang, 'method.lens.ex.na') : formatPercentChange(v, lang, { decimals: 0 }));

  // Check counts over every check, for the ladder summary.
  const sums = Object.fromEntries(STATUSES.map((s) => [s, 0])) as Record<Status, number>;
  for (const c of Object.values(checks?.counts ?? {})) for (const s of STATUSES) sums[s] += c[s] ?? 0;
  const products = new Set(checks?.rows.map((r) => r[0]) ?? []).size;
  const summary = STATUSES.filter((s) => sums[s] > 0)
    .map((s) => t(lang, 'method.ladder.summary.item', { n: num(sums[s]), status: t(lang, `method.status.${s}`).toLowerCase() }))
    .join(', ');
  const hsCounts = checks?.counts.hs_breaks ?? {};

  const tier = (n: number) => ({
    check: t(lang, `method.ladder.t${n}` as StringKey),
    against: t(lang, `method.ladder.t${n}.against` as StringKey),
    cadence: t(lang, `method.ladder.t${n}.cadence` as StringKey),
  });
  const example = `/${lang}/explore#t=2024&base=2019&p=C:batteries:cells&c=change&focus=CHN`;

  return (
    <div className="page page--doc mt">
      <header className="mt-head">
        <p className="lr-kicker">{t(lang, 'method.kicker')}</p>
        <h1 className="page__title">{t(lang, 'method.title')}</h1>
        <p className="page__lede">{t(lang, 'method.dek')}</p>
      </header>

      <nav className="mt-toc" aria-labelledby="mt-toc-h">
        <p id="mt-toc-h" className="lr-label">{t(lang, 'method.contents')}</p>
        <ol>
          {SECTIONS.map(([id, key]) => <li key={id}><a href={`#${id}`}>{t(lang, key)}</a></li>)}
        </ol>
      </nav>

      <Section id="standard" title={t(lang, 'method.std.h')}>
        <div className="lr-prose">
          <P text={t(lang, 'method.std.p1')} />
          {(['c1', 'c2', 'c3', 'c4', 'c5'] as const).map((c) => <P key={c} text={t(lang, `method.std.${c}`)} />)}
        </div>
      </Section>

      <Section id="data" title={t(lang, 'method.data.h')}>
        <div className="lr-prose">
          <P text={t(lang, 'method.data.p1', {
            a0: total?.A[0] ?? 1962, a1: total?.A[1] ?? meta.last.A,
            m0: total?.M ? formatPeriod(total.M[0], lang) : '–', m1: formatPeriod(meta.last.M, lang),
          })} />
          <P text={t(lang, 'method.data.p2')} />
          <P text={t(lang, 'method.data.p3', {
            nodes: num(meta.nodes.length), builtA: day(meta.layer_built.A, lang), builtM: day(meta.layer_built.M, lang), built,
          })} />
          <P text={t(lang, 'method.data.p4', {
            products: num(meta.products.length), chapters: num(kinds('chapter')), baskets: num(kinds('basket')), stages: num(kinds('stage')),
          })} />
          {(meta.supplements ?? []).map((sup) => (
            <P key={sup.source} text={t(lang, 'method.data.p5', {
              name: lang === 'ko' ? meta.nodes[sup.node].ko : meta.nodes[sup.node].en,
              when: (sup.ranges ?? [sup.M]).map(([a, b]) => monthRange(a, b, lang)).join(lang === 'ko' ? ', ' : ' and '),
              src: lang === 'ko' ? sup.ko : sup.en, url: sup.url, fetched: day(sup.fetched, lang),
              prelim: sup.preliminary_from != null ? t(lang, 'method.data.p5prelim', { months: monthRange(sup.preliminary_from, sup.M[1], lang) }) : '',
            })} />
          ))}
        </div>
      </Section>

      <Section id="mirror" title={t(lang, 'method.mirror.h')}>
        <div className="lr-prose">
          <P text={t(lang, 'method.mirror.p1')} />
          <P text={t(lang, 'method.mirror.p2', { year: yA, imp: snap ? formatShare(snap.tot.imp_rep, lang, { decimals: 1 }) : '–' })} />
          <P text={t(lang, 'method.mirror.p3')} />
          <P text={t(lang, 'method.mirror.p4')} />
          <P text={t(lang, 'method.mirror.p5')} />
        </div>
      </Section>

      <Section id="coverage" title={t(lang, 'method.cov.h')}>
        <div className="lr-prose">
          <P text={t(lang, 'method.cov.p1', { y1: yA - 1, r1: rep(yA - 1), y2: yA, r2: rep(yA), y3: meta.last.A, r3: rep(meta.last.A) })} />
          <P text={t(lang, 'method.cov.p2', { cA: yA, cM: formatPeriod(meta.complete.M, lang) })} />
          <P text={t(lang, 'method.cov.p3')} />
        </div>
        <CoverageChart lang={lang} coverage={meta.coverage.M} reporters={meta.reporters.M}
          from={(Math.floor(meta.complete.M / 100) - 1) * 100 + 1} to={meta.last.M} complete={meta.complete.M}
          built={day(meta.layer_built.M, lang)}
          fills={(meta.supplements ?? []).map((sup) => ({
            name: lang === 'ko' ? meta.nodes[sup.node].ko : meta.nodes[sup.node].en, source: sup.source, ranges: sup.ranges ?? [sup.M],
          }))} />
        <div className="lr-prose">
          <P text={t(lang, 'method.cov.p4')} />
          <P text={t(lang, 'method.cov.p5')} />
          <P text={t(lang, 'method.cov.p6', { shown: formatPeriod(meta.shown?.M ?? meta.last.M, lang) })} />
        </div>
      </Section>

      <Section id="hs" title={t(lang, 'method.hs.h')}>
        <div className="lr-prose">
          <P text={t(lang, 'method.hs.p1')} />
          <P text={t(lang, 'method.hs.p2')} />
          <P text={t(lang, 'method.hs.p3', { pass: num(hsCounts.pass ?? 0), watch: num(hsCounts.watch ?? 0) })} />
        </div>
      </Section>

      <Section id="lenses" title={t(lang, 'method.lens.h')}>
        <div className="lr-prose">
          <P text={t(lang, 'method.lens.p1')} />
          <P text={t(lang, 'method.lens.pages', { lang })} />
        </div>
        <div className="lr-tablewrap mt-table">
          <table className="lr-table">
            <caption>{t(lang, 'method.lens.caption')}</caption>
            <thead>
              <tr>
                {(['lens', 'shows', 'removes', 'costs', 'default'] as const).map((c) => <th key={c} scope="col">{t(lang, `method.lens.col.${c}`)}</th>)}
              </tr>
            </thead>
            <tbody>
              {(['L', 'M'] as const).map((l) => (
                <tr key={l}>
                  <th scope="row" className="mt-rowhead">{t(lang, `method.lens.${l}`)}</th>
                  <td>{t(lang, `method.lens.${l}.shows`)}</td>
                  <td>{t(lang, `method.lens.${l}.removes`)}</td>
                  <td>{t(lang, `method.lens.${l}.costs`)}</td>
                  <td>{t(lang, `method.lens.${l}.default`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 className="mt-h3">{t(lang, 'method.lens.example.h')}</h3>
        <div className="lr-prose">
          <P text={t(lang, 'method.lens.example.p', { m: pc(siteM), l: pc(siteL) })} />
        </div>
        <div className="lr-tablewrap mt-table mt-table--narrow">
          <table className="lr-table">
            <caption>{rich(t(lang, 'method.lens.ex.caption'))}</caption>
            <thead>
              <tr>
                <th scope="col">{t(lang, 'method.lens.ex.col.lens')}</th>
                <th scope="col" className="num">{t(lang, 'method.lens.ex.col.site')}</th>
              </tr>
            </thead>
            <tbody>
              <tr><th scope="row" className="mt-rowhead">{t(lang, 'method.lens.ex.M')}</th><td className="num">{pc(siteM)}</td></tr>
              <tr><th scope="row" className="mt-rowhead">{t(lang, 'method.lens.ex.L')}</th><td className="num">{pc(siteL)}</td></tr>
            </tbody>
          </table>
        </div>
        <div className="lr-prose">
          <P text={t(lang, 'method.lens.p2')} />
          <P text={t(lang, 'method.lens.p3')} />
          <P text={t(lang, 'method.lens.p4')} />
        </div>
      </Section>

      <Section id="monthly-explore" title={t(lang, 'method.mx.h')}>
        <div className="lr-prose">
          {(['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7'] as const).map((k) => <P key={k} text={t(lang, `method.mx.${k}`, { lang })} />)}
          <P className="mt-muted" text={t(lang, 'method.mx.ref')} />
        </div>
      </Section>

      <Section id="chains" title={t(lang, 'method.chains.h')}>
        <div className="lr-prose">
          {(['p1', 'p2', 'p3', 'p4', 'p5'] as const).map((k) => <P key={k} text={t(lang, `method.chains.${k}`)} />)}
          <P text={t(lang, 'method.chains.p6', { lang })} />
        </div>
      </Section>

      <Section id="blind" title={t(lang, 'method.blind.h')}>
        <ul className="lr-prose mt-list">
          {(['home', 'owner', 'va', 'hubs', 'codes', 'cause'] as const).map((k) => <li key={k}>{rich(t(lang, `method.blind.${k}`))}</li>)}
        </ul>
      </Section>

      <Section id="network" title={t(lang, 'method.net.h')}>
        <div className="lr-prose">
          <P text={t(lang, 'method.net.p1', {
            year: yA, edges: num(snap?.tot.edges), nodes: num(snap?.tot.nodes),
            density: snap ? formatShare(snap.tot.density, lang) : '–',
          })} />
        </div>
        <div className="lr-tablewrap mt-table">
          <table className="lr-table">
            <thead>
              <tr>
                <th scope="col">{t(lang, 'method.net.col.measure')}</th>
                <th scope="col">{t(lang, 'method.net.col.def')}</th>
                <th scope="col">{t(lang, 'method.net.col.reading')}</th>
              </tr>
            </thead>
            <tbody>
              {([1, 2, 3, 4, 5, 6, 7, 8] as const).map((i) => (
                <tr key={i}>
                  <th scope="row" className="mt-rowhead">{t(lang, `method.net.m${i}`)}</th>
                  <td>{t(lang, `method.net.m${i}.def`)}</td>
                  <td>{t(lang, `method.net.m${i}.read`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="two-way" title={t(lang, 'method.tw.h')}>
        <div className="lr-prose">
          {(['p1', 'p2', 'p3', 'p4', 'p5'] as const).map((k) => <P key={k} text={t(lang, `method.tw.${k}`)} />)}
        </div>
      </Section>

      <Section id="groups" title={t(lang, 'method.groups.h')}>
        <div className="lr-prose">
          {(['p1', 'p2', 'p3'] as const).map((k) => <P key={k} text={t(lang, `method.groups.${k}`)} />)}
          <P text={t(lang, 'method.groups.p4', { date: day(asOf, lang) })} />
        </div>
        {dated.length ? (
          <div className="lr-tablewrap mt-table">
            <table className="lr-table">
              <thead>
                <tr>
                  <th scope="col">{t(lang, 'method.groups.col.group')}</th>
                  <th scope="col">{t(lang, 'method.groups.col.kind')}</th>
                  <th scope="col" className="num">{t(lang, 'method.groups.col.members')}</th>
                  <th scope="col">{t(lang, 'method.groups.col.note')}</th>
                  <th scope="col">{t(lang, 'method.groups.col.sources')}</th>
                </tr>
              </thead>
              <tbody>
                {dated.map(({ k, g }) => (
                  <tr key={k}>
                    <th scope="row" className="mt-rowhead">{g[lang]}</th>
                    <td>{t(lang, g.kind === 'bloc' ? 'method.groups.kind.bloc' : 'method.groups.kind.club')}</td>
                    <td className="num">{num(membersOn(g, asOf).length)}</td>
                    <td>{g.note?.[lang] ?? ''}</td>
                    <td>{g.sources.length ? g.sources.map((u, i) => <span key={u}>{i ? ', ' : ''}<a href={u} rel="noopener noreferrer">{t(lang, 'method.groups.source', { n: i + 1 })}</a></span>) : t(lang, 'method.groups.pending')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Section>

      <Section id="checks" title={t(lang, 'method.ladder.h')}>
        <div className="lr-prose">
          <P text={t(lang, 'method.ladder.p1')} />
        </div>
        <div className="lr-tablewrap mt-table">
          <table className="lr-table">
            <thead>
              <tr>
                <th scope="col" className="num">{t(lang, 'method.ladder.col.tier')}</th>
                <th scope="col">{t(lang, 'method.ladder.col.check')}</th>
                <th scope="col">{t(lang, 'method.ladder.col.against')}</th>
                <th scope="col">{t(lang, 'method.ladder.col.cadence')}</th>
              </tr>
            </thead>
            <tbody>
              {[0, 1, 2, 3, 4, 5].map((n) => {
                const r = tier(n);
                return (
                  <tr key={n}>
                    <td className="num">{n}</td>
                    <td>{r.check}</td>
                    <td>{r.against}</td>
                    <td>{r.cadence}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {checks ? (
          <div className="lr-prose">
            <P text={t(lang, 'method.ladder.p2', { date: day(checks.run_at, lang), n: num(products), summary, lang })} />
          </div>
        ) : null}
      </Section>

      <TrailRule />

      <Section id="licence" title={t(lang, 'method.lic.h')}>
        <div className="lr-prose">
          <P text={t(lang, 'method.lic.p1')} />
          <P text={t(lang, 'method.lic.p2', { originals: num(meta.records.originals), budget: num(meta.records.budget), line: num(meta.records.line) })} />
          <P text={t(lang, 'method.lic.p3')} />
          {meta.supplements?.length ? <P text={t(lang, 'method.lic.p5')} /> : null}
          <P text={t(lang, 'method.lic.p6', { originals: num(meta.records.originals), budget: num(meta.records.budget) })} />
          <P text={t(lang, 'method.lic.p4')} />
        </div>
      </Section>

      <Section id="address" title={t(lang, 'method.hash.h')}>
        <div className="lr-prose">
          <P text={t(lang, 'method.hash.p1')} />
          <p><a className="mt-url" href={example}>{example}</a></p>
          <P text={t(lang, 'method.hash.p2')} />
        </div>
        <div className="lr-tablewrap mt-table">
          <table className="lr-table">
            <thead>
              <tr>
                <th scope="col">{t(lang, 'method.hash.col.key')}</th>
                <th scope="col">{t(lang, 'method.hash.col.meaning')}</th>
                <th scope="col">{t(lang, 'method.hash.col.default')}</th>
              </tr>
            </thead>
            <tbody>
              {HASH.map(([k, what, dflt]) => (
                <tr key={k}>
                  <th scope="row" className="mt-rowhead"><code className="lr-hs">{k}</code></th>
                  <td>{rich(t(lang, what))}</td>
                  <td>{rich(dflt.startsWith('`') ? dflt : t(lang, dflt as StringKey))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section id="cite" title={t(lang, 'method.cite.h')}>
        <div className="lr-prose">
          <P text={t(lang, 'method.cite.p1')} />
          <blockquote className="mt-cite">{t(lang, 'method.cite.text', { built })}</blockquote>
          <P text={t(lang, 'method.cite.p2')} />
        </div>
        <p className="lr-caption mt-source">{t(lang, 'method.source.line', { built })}</p>
      </Section>
    </div>
  );
}
