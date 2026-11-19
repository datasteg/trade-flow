import { formatMonth, formatNumber, formatPeriod, t, type Lang } from '@/lib/i18n';
import { coverageShare, monthRange } from './data';

const mlabel = (p: number, lang: Lang) => formatPeriod(p, lang);

/** The coverage line of the monthly layer: the share of 2024 world exports held by the economies that filed each
 *  month, from `from` to the last month with data, the partial months after the last complete month in a band.
 *  Server-rendered: the line is an SVG stretched to the plot (non-scaling strokes), the labels are HTML placed in
 *  per cent, so text keeps its size on a phone. Every month has a native tooltip and a row in the table view. */
export function CoverageChart({ lang, coverage, reporters, from, to, complete, built, fills = [] }: {
  lang: Lang;
  coverage: Record<string, number>;
  reporters: Record<string, number>;
  from: number;
  to: number;
  complete: number;
  /** When the monthly layer was built, already formatted. */
  built: string;
  /** Economies counted in some months through a supplement (Korea from the customs service), not a Comtrade file:
   *  the table and the tooltips flag those months. */
  fills?: { name: string; source: string; ranges: [number, number][] }[];
}) {
  const filled = (m: number) => fills.filter((f) => f.ranges.some(([a, b]) => m >= a && m <= b));
  const flag = (m: number) => filled(m).map((f) => t(lang, 'method.chart.fill', { name: f.name, src: f.source })).join(', ');
  const months = monthRange(from, to).filter((m) => coverage[String(m)] != null);
  if (months.length < 2) return null;
  const n = months.length;
  const X = (i: number) => (i / (n - 1)) * 100; // per cent of the plot width
  const Y = (v: number) => (1 - v) * 100; // per cent of the plot height, from the top
  const cov = (m: number) => coverage[String(m)];
  const rep = (m: number) => reporters[String(m)] ?? null;
  const ci = months.indexOf(complete);
  const last = months[n - 1];
  const d = months.map((m, i) => `${i ? 'L' : 'M'}${(X(i) * 10).toFixed(1)},${Y(cov(m)).toFixed(2)}`).join(' ');
  const years = months.map((m, i) => ({ m, i })).filter(({ m }) => m % 100 === 1);
  const pct = (v: number) => coverageShare(v, lang);

  // The caption names a year after the last complete month and the last three months.
  const picks = [complete + 100, ...months.slice(-3)].filter((m, i, a) => months.includes(m) && a.indexOf(m) === i && m !== complete);
  const list = picks.map((m) => t(lang, 'method.chart.item', { c: pct(cov(m)), m: mlabel(m, lang) })).join('; ');
  const cLabel = ci >= 0 ? t(lang, 'method.chart.complete', { m: mlabel(complete, lang), c: pct(cov(complete)), n: formatNumber(rep(complete), lang) }) : null;
  const endLabel = t(lang, 'method.chart.end', { m: mlabel(last, lang), c: pct(cov(last)), n: formatNumber(rep(last), lang) });

  return (
    <figure className="mt-fig">
      <p className="mt-fig__title">{t(lang, 'method.chart.title', { from: mlabel(months[0], lang), to: mlabel(last, lang) })}</p>
      <p className="mt-fig__unit">{t(lang, 'method.chart.unit')}</p>
      <div className="cov" role="img" aria-label={t(lang, 'method.chart.aria', {
        from: mlabel(months[0], lang), to: mlabel(last, lang),
        c1: ci >= 0 ? pct(cov(complete)) : '–', m1: mlabel(complete, lang), c2: pct(cov(last)), m2: mlabel(last, lang),
      })}>
        <div className="cov__y" aria-hidden>
          {[1, 0.75, 0.5, 0.25, 0].map((v) => <span key={v} style={{ top: `${Y(v)}%` }}>{v * 100}</span>)}
        </div>
        <div className="cov__plot">
          <svg viewBox="0 0 1000 100" preserveAspectRatio="none" aria-hidden>
            {ci >= 0 && ci < n - 1 ? <rect className="cov__band" x={X(ci + 0.5) * 10} y={0} width={1000 - X(ci + 0.5) * 10} height={100} /> : null}
            {[0.25, 0.5, 0.75, 1].map((v) => <line key={v} className="cov__grid" x1={0} x2={1000} y1={Y(v)} y2={Y(v)} />)}
            <line className="cov__axis" x1={0} x2={1000} y1={100} y2={100} />
            <path className="cov__line" d={d} />
            {months.map((m, i) => (
              <rect key={m} className="cov__hit" x={(X(i) - 50 / (n - 1)) * 10} y={0} width={1000 / (n - 1)} height={100}>
                <title>{`${formatMonth(Math.floor(m / 100), m % 100, lang)}: ${pct(cov(m))}, ${formatNumber(rep(m), lang)}${flag(m) ? ` (${flag(m)})` : ''}`}</title>
              </rect>
            ))}
          </svg>
          {ci >= 0 && ci < n - 1 ? <span className="cov__bandlabel" style={{ left: `${X(ci + 0.5)}%` }}>{t(lang, 'method.chart.partial')}</span> : null}
          {ci >= 0 ? <span className="cov__dot" style={{ left: `${X(ci)}%`, top: `${Y(cov(complete))}%` }} aria-hidden /> : null}
          <span className="cov__dot cov__dot--end" style={{ left: '100%', top: `${Y(cov(last))}%` }} aria-hidden />
          {cLabel ? <span className="cov__note cov__note--complete" style={{ right: `${100 - X(ci)}%`, top: `${Y(cov(complete))}%` }}>{cLabel}</span> : null}
          {cov(last) < 0.2
            ? <span className="cov__note cov__note--end cov__note--above" style={{ bottom: `${100 - Y(cov(last))}%` }}>{endLabel}</span>
            : <span className="cov__note cov__note--end cov__note--below" style={{ top: `${Y(cov(last))}%` }}>{endLabel}</span>}
        </div>
        <div className="cov__x" aria-hidden>
          {years.map(({ m, i }) => <span key={m} style={{ left: `${X(i)}%` }}>{Math.floor(m / 100)}</span>)}
        </div>
      </div>
      <details className="mt-details">
        <summary>{t(lang, 'method.chart.table')}</summary>
        <div className="lr-tablewrap mt-scroll">
          <table className="lr-table">
            <thead>
              <tr>
                <th scope="col">{t(lang, 'method.chart.col.month')}</th>
                <th scope="col" className="num">{t(lang, 'method.chart.col.cov')}</th>
                <th scope="col" className="num">{t(lang, 'method.chart.col.rep')}</th>
                {fills.length ? <th scope="col">{t(lang, 'method.chart.col.src')}</th> : null}
              </tr>
            </thead>
            <tbody>
              {months.map((m) => (
                <tr key={m}>
                  <td>{mlabel(m, lang)}</td>
                  <td className="num">{formatNumber(cov(m) * 100, lang, { decimals: 1 })}</td>
                  <td className="num">{formatNumber(rep(m), lang)}</td>
                  {fills.length ? <td>{flag(m) || t(lang, 'method.chart.comtrade')}</td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <figcaption className="lr-caption mt-fig__caption">
        {t(lang, 'method.chart.caption', {
          cm: mlabel(complete, lang), cc: ci >= 0 ? pct(cov(complete)) : '–', cn: formatNumber(rep(complete), lang), list, built,
        })}
        {fills.map((f) => <span key={f.name}> {t(lang, 'method.chart.fillNote', { name: f.name, src: f.source })}</span>)}
      </figcaption>
    </figure>
  );
}
