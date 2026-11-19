'use client';
// The scenario a reader moves: pick the shocked supplier, set the cut, (for a closed route) keep the
// pipelines open, and read the first-round answer: who loses what share of their supply, who could fill the gap,
// and what that means one stage down the chain. All arithmetic runs here, on the tables of scenario_data.
import { useId, useMemo, useState } from 'react';
import { useFocus } from '@/components/FocusOnly';
import { formatPointChange, formatShare, t, type Lang } from '@/lib/i18n';
import { CsvButton } from './CsvButton';
import { cap, mid, type NameList } from './names';
import { downListed, otherExporters, passDown, ranked, runCut, SMALLER, tariffShift, worldCut, type ImporterResult } from './scenario';
import type { ScenarioTable } from './types';

export interface ScenarioOption { key: string; label: string; members: number[] }
export interface ScenarioUse { share: number | null; what?: string; source?: string; year?: number | null; url?: string | null }

export interface ScenarioProps {
  lang: Lang;
  caseId: string;
  kind: 'cut_supplier' | 'close_route' | 'cut_output' | 'tariff';
  names: NameList;
  /** The supplier picker; the first is the default. For a closed route, the economies on the route. */
  suppliers: ScenarioOption[];
  cut: number;
  route?: string;
  bypass?: ScenarioOption | null;
  /** Tariff: the one importer it applies to. */
  importer?: number | null;
  /** Only these importers (EU members for pipeline gas). */
  importerSet?: { label: string; members: number[] } | null;
  products: { id: string; label: string; table: ScenarioTable; base: boolean }[];
  down: { id: string; label: string; table: ScenarioTable; use: ScenarioUse | null; feedstock: boolean }[];
  period: string;
  source: string;
  /** What the case says the scenario does, and its note. */
  intro: string;
  note?: string | null;
}

const RANKED = 12;

export function Scenario(p: ScenarioProps) {
  const { lang, names } = p;
  const uid = useId();
  const [sup, setSup] = useState(p.suppliers[0]?.key ?? '');
  const [cut, setCut] = useState(Math.round((p.cut ?? 1) * 100));
  const [bypass, setBypass] = useState(false);
  const [prod, setProd] = useState(p.products[0]?.id ?? '');
  const [picked, setPicked] = useState<number | null>(null);
  const [uses, setUses] = useState<Record<string, number>>(() => Object.fromEntries(
    p.down.filter((d) => d.use?.share != null).map((d) => [d.id, Math.round((d.use!.share as number) * 100)])));

  const nm = (i: number) => (i === SMALLER ? t(lang, 'cases.scen.smaller') : names.names[i] ?? `#${i}`);
  // the reader's focus economy (?focus=ISO3) is marked and kept in the table; none by default
  const focusIso = useFocus();
  const fi = focusIso ? names.iso.indexOf(focusIso) : -1;
  const fs = (v: number | null | undefined) => (v == null ? '–' : formatShare(v, lang, { decimals: Math.abs(v) < 0.01 && v !== 0 ? 2 : 1 }));
  const fp = (v: number | null | undefined) => formatPointChange(v, lang, { decimals: 1 });

  const option = p.suppliers.find((s) => s.key === sup) ?? p.suppliers[0];
  const shocked = useMemo(() => {
    const by = new Set(bypass && p.bypass ? p.bypass.members : []);
    return (option?.members ?? []).filter((i) => !by.has(i));
  }, [option, bypass, p.bypass]);
  const c = cut / 100;
  const product = p.products.find((x) => x.id === prod) ?? p.products[0];
  const table = product.table;
  // a closed bloc (EU27, the Gulf): its members are inside the closure, so they are neither importers at risk nor
  // suppliers that could fill the gap, nor exporters one stage down (scenario.ts)
  const bloc = useMemo(() => ((p.kind === 'cut_supplier' || p.kind === 'cut_output') && shocked.length > 1 ? shocked : null), [p.kind, shocked]);
  const exclude = useMemo(() => (p.kind === 'close_route' ? option?.members ?? [] : bloc), [p.kind, option, bloc]);
  const only = p.kind === 'tariff' && p.importer != null ? [p.importer] : p.importerSet?.members ?? null;

  const rows = useMemo(() => runCut(table, shocked, c, { only, exclude }), [table, shocked, c, only, exclude]);
  const top = useMemo(() => ranked(rows, RANKED, fi), [rows, fi]);
  const focusRow = fi >= 0 ? rows.find((r) => r.i === fi) ?? null : null;
  const focus: ImporterResult | null = rows.find((r) => r.i === picked) ?? (p.kind === 'tariff' ? rows[0] : focusRow ?? top[0]) ?? null;
  const cutWorld = worldCut(table, shocked, c);
  const over = rows.filter((r) => r.risk > 0.25).length;
  const supLabel = option?.label ?? '';

  // One stage down, from the base product only.
  const exposure = useMemo(() => {
    const base = p.products.find((x) => x.base);
    if (!base) return new Map<number, number>();
    const all = runCut(base.table, shocked, c, { only, exclude });
    const m = new Map(all.map((r) => [r.i, r.risk]));
    // Importers filtered out of this scenario (outside the EU for pipeline gas) are not exposed.
    for (const imp of base.table.importers) if (!m.has(imp.i)) m.set(imp.i, 0);
    return m;
  }, [p.products, shocked, c, only, exclude]);

  const csv: (string | number | null)[][] = [
    [t(lang, 'cases.scen.csv.importer'), t(lang, 'cases.scen.csv.iso'), t(lang, 'cases.scen.csv.world'), t(lang, 'cases.scen.csv.from'),
      t(lang, 'cases.scen.csv.risk'), t(lang, 'cases.scen.csv.gap'), t(lang, 'cases.scen.csv.others'), t(lang, 'cases.scen.csv.need')],
    ...[...rows].sort((a, b) => b.risk - a.risk).map((r) => [nm(r.i), names.iso[r.i], r.world, r.fromShocked, r.risk, r.worldGap, r.others, r.need]),
  ];

  const cutLabel = p.kind === 'tariff' ? t(lang, 'cases.scen.cutTariff', { s: supLabel }) : p.kind === 'cut_output'
    ? t(lang, 'cases.scen.cutOutput', { s: supLabel }) : t(lang, 'cases.scen.cut', { s: supLabel });

  return (
    <section className="st-scen" aria-labelledby={`${uid}-h`}>
      <p className="st-scen__intro">{p.intro}</p>
      <div className="st-scen__controls">
        {p.kind === 'close_route' ? (
          <div className="lr-field">
            <span className="lr-label">{t(lang, 'cases.scen.route')}</span>
            <span className="st-scen__fixed">{t(lang, 'cases.scen.routeIs', { route: p.route ?? '', s: supLabel })}</span>
          </div>
        ) : p.suppliers.length > 1 ? (
          <label className="lr-field">
            <span className="lr-label">{p.kind === 'cut_output' ? t(lang, 'cases.scen.producer') : t(lang, 'cases.scen.supplier')}</span>
            <select className="st-select" value={sup} onChange={(e) => { setSup(e.target.value); setPicked(null); }}>
              {p.suppliers.map((s) => <option key={s.key} value={s.key}>{cap(s.label)}</option>)}
            </select>
          </label>
        ) : (
          <div className="lr-field">
            <span className="lr-label">{t(lang, 'cases.scen.supplier')}</span>
            <span className="st-scen__fixed">{cap(supLabel)}</span>
          </div>
        )}
        <label className="lr-field st-scen__cut">
          <span className="lr-label">{cutLabel}: <b>{cut}%</b></span>
          <input type="range" min={0} max={100} step={5} value={cut} onChange={(e) => setCut(Number(e.target.value))}
            aria-valuetext={`${cut}%`} style={{ ['--v' as string]: `${cut}%` }} />
        </label>
        {p.bypass ? (
          <label className="st-switch">
            <input type="checkbox" checked={bypass} onChange={(e) => setBypass(e.target.checked)} />
            <span>{t(lang, 'cases.scen.bypass', { econ: p.bypass.label })}</span>
          </label>
        ) : null}
        {p.products.length > 1 ? (
          <div className="lr-field st-scen__products">
            <span className="lr-label" id={`${uid}-p`}>{t(lang, 'cases.scen.product')}</span>
            <div className="lr-seg st-seg-wrap" role="group" aria-labelledby={`${uid}-p`}>
              {p.products.map((x) => (
                <button key={x.id} type="button" aria-pressed={x.id === product.id} onClick={() => setProd(x.id)}>{x.label}</button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <h3 className="st-scen__h" id={`${uid}-h`}>
        {p.kind === 'tariff'
          ? t(lang, 'cases.scen.hTariff', { importer: nm(p.importer ?? -1), product: product.label, p: p.period })
          : t(lang, 'cases.scen.hRanked', { product: product.label, p: p.period })}
      </h3>
      <ul className="lr-stats st-scen__tiles">
        {p.kind === 'tariff' && focus ? (
          <li className="lr-stat">
            <span className="lr-stat__label">{t(lang, 'cases.scen.tileTariffWorld', { s: supLabel, importer: nm(focus.i) })}</span>
            <span className="lr-stat__value">{fs(focus.worldGap)}</span>
            <span className="lr-stat__meta">{t(lang, 'cases.scen.tileTariffWorldMeta', { product: mid(product.label, lang) })}</span>
          </li>
        ) : (
          <li className="lr-stat">
            <span className="lr-stat__label">{t(lang, 'cases.scen.tileWorld', { s: supLabel })}</span>
            <span className="lr-stat__value">{fs(cutWorld)}</span>
            <span className="lr-stat__meta">{t(lang, 'cases.scen.tileWorldMeta', { product: mid(product.label, lang) })}</span>
          </li>
        )}
        {p.kind === 'tariff' && focus ? (
          <li className="lr-stat">
            <span className="lr-stat__label">{t(lang, 'cases.scen.tileNeed')}</span>
            <span className="lr-stat__value">{focus.need == null ? '–' : `+${formatShare(focus.need, lang, { decimals: 1 })}`}</span>
            <span className="lr-stat__meta">{t(lang, 'cases.scen.tileNeedMeta', { importer: nm(focus.i) })}</span>
          </li>
        ) : (
          <li className="lr-stat">
            <span className="lr-stat__label">{t(lang, 'cases.scen.tileOver')}</span>
            <span className="lr-stat__value">{over}</span>
            <span className="lr-stat__meta">{t(lang, 'cases.scen.tileOverMeta', { n: rows.length })}</span>
          </li>
        )}
        {p.kind === 'tariff' || fi >= 0 ? (
          <li className="lr-stat">
            <span className="lr-stat__label">{p.kind === 'tariff' && focus ? t(lang, 'cases.scen.tileRiskOf', { importer: nm(focus.i) }) : <><span className="lr-marker lr-marker--sm" aria-hidden /> {t(lang, 'cases.scen.tileFocus', { name: nm(fi) })}</>}</span>
            <span className="lr-stat__value">{p.kind === 'tariff' ? fs(focus?.risk) : focusRow ? fs(focusRow.risk) : '–'}</span>
            <span className="lr-stat__meta">{p.kind === 'tariff' ? t(lang, 'cases.scen.tileRiskMeta') : focusRow
              ? t(lang, 'cases.scen.tileFocusMeta', { v: fs(focusRow.fromShocked), s: supLabel })
                : t(lang, 'cases.scen.focusAbsent', { name: nm(fi), product: mid(product.label, lang) })}</span>
          </li>
        ) : null}
      </ul>

      {p.kind === 'tariff' && focus ? (
        <TariffTable lang={lang} r={focus} table={table} shocked={shocked} c={c} nm={nm} fs={fs} fp={fp} kor={fi} />
      ) : (
        <div className="lr-tablewrap">
          <table className="lr-table st-scen__table">
            <caption>{fi >= 0 ? t(lang, 'cases.scen.tableCaptionFocus', { n: RANKED, name: nm(fi) }) : t(lang, 'cases.scen.tableCaption', { n: RANKED })}</caption>
            <thead>
              <tr>
                <th scope="col">{t(lang, 'cases.scen.col.importer')}</th>
                <th scope="col" className="num st-hide-sm">{t(lang, 'cases.scen.col.world')}</th>
                <th scope="col" className="num st-hide-sm">{t(lang, 'cases.scen.col.from', { s: supLabel })}</th>
                <th scope="col" className="st-scen__riskcol">{t(lang, 'cases.scen.col.risk')}</th>
                <th scope="col" className="num">{t(lang, 'cases.scen.col.need')}</th>
              </tr>
            </thead>
            <tbody>
              {top.map((r) => (
                <tr key={r.i} className={`${r.i === fi ? 'is-focus' : ''}${focus?.i === r.i ? ' is-picked' : ''}`}>
                  <td>
                    <button type="button" className="st-scen__pick" onClick={() => setPicked(r.i)} aria-pressed={focus?.i === r.i}>
                      {r.i === fi ? <span className="lr-marker lr-marker--sm" aria-hidden /> : null}
                      {nm(r.i)}{r.filed ? '' : ' *'}
                    </button>
                  </td>
                  <td className="num st-hide-sm">{fs(r.world)}</td>
                  <td className="num st-hide-sm">{fs(r.fromShocked)}</td>
                  <td className="st-scen__riskcol">
                    <span className="st-scen__risk">
                      <span className="st-scen__bar"><span style={{ width: `${Math.min(100, r.risk * 100)}%` }} /></span>
                      <b>{fs(r.risk)}</b>
                    </span>
                  </td>
                  <td className="num">{r.risk === 0 ? '–' : r.need == null ? t(lang, 'cases.scen.noOthers') : `+${formatShare(r.need, lang, { decimals: 0 })}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {top.some((r) => !r.filed) ? <p className="lr-caption">{t(lang, 'cases.scen.notFiled')}</p> : null}
        </div>
      )}

      {focus && p.kind !== 'tariff' ? (
        <FillPanel lang={lang} r={focus} table={table} shocked={shocked} nm={nm} fs={fs} fp={fp} kor={fi} />
      ) : null}
      {p.kind === 'tariff' ? (
        <div className="st-scen__fill">
          <p className="lr-card__h">{t(lang, 'cases.scen.largestOthers')}</p>
          <ul className="st-scen__list">
            {otherExporters(table, shocked).map(([i, s]) => <li key={i}>{nm(i)} <b>{fs(s)}</b></li>)}
          </ul>
        </div>
      ) : null}

      {p.down.length && product.base ? (
        <div className="st-scen__down">
          <h3 className="st-scen__h">{t(lang, 'cases.scen.hDown')}</h3>
          <div className="st-scen__downs">
            {p.down.map((d) => {
              const unknown = d.use != null && d.use.share == null;
              const u = d.use?.share != null ? (uses[d.id] ?? 0) / 100 : 1;
              const res = unknown ? null : passDown(d.table, exposure, u, p.kind === 'close_route' ? { members: shocked, cut: c } : null, bloc);
              const sum = res ? downListed(res.rows, 8, fi) : null;
              return (
                <div key={d.id} className="st-scen__downcard">
                  <p className="lr-card__h">{d.label}</p>
                  {d.use?.share != null ? (
                    <label className="lr-field st-scen__use">
                      <span className="lr-label">{t(lang, 'cases.scen.use', { from: mid(product.label, lang), v: `${uses[d.id] ?? 0}%` })}</span>
                      <input type="range" min={0} max={100} step={1} value={uses[d.id] ?? 0}
                        onChange={(e) => setUses((s) => ({ ...s, [d.id]: Number(e.target.value) }))} aria-valuetext={`${uses[d.id] ?? 0}%`}
                        style={{ ['--v' as string]: `${uses[d.id] ?? 0}%` }} />
                      <span className="lr-caption">
                        {t(lang, 'cases.scen.useDefault', { v: formatShare(d.use.share, lang), what: d.use.what ?? '' })}{' '}
                        {d.use.url ? <a href={d.use.url} rel="noopener noreferrer" target="_blank">{d.use.source}</a> : d.use.source}
                        {d.use.year ? ` (${d.use.year})` : ''}
                        {(uses[d.id] ?? 0) !== Math.round(d.use.share * 100) ? (
                          <> · <button type="button" className="st-linkbtn" onClick={() => setUses((s) => ({ ...s, [d.id]: Math.round((d.use!.share as number) * 100) }))}>{t(lang, 'cases.scen.useReset')}</button></>
                        ) : null}
                      </span>
                    </label>
                  ) : unknown ? (
                    <p className="lr-caption">{t(lang, 'cases.scen.useUnknown', { what: d.use?.what ?? '' })}</p>
                  ) : (
                    <p className="lr-caption st-scen__upper"><b>{t(lang, 'cases.scen.upper')}</b> {t(lang, 'cases.scen.useWhole')}</p>
                  )}
                  {res && sum ? (
                    <>
                      <p className="st-scen__downtotal">
                        {t(lang, 'cases.scen.downTotal', { v: fs(sum.total), n: sum.count, product: mid(d.label, lang) })}{' '}
                        {t(lang, 'cases.scen.downListed', { k: sum.listed.length, v: fs(sum.listedTotal) })}
                      </p>
                      <div className="lr-tablewrap">
                        <table className="lr-table">
                          <thead>
                            <tr>
                              <th scope="col">{t(lang, 'cases.scen.col.exporter')}</th>
                              <th scope="col" className="num st-hide-sm">{t(lang, 'cases.scen.col.xshare')}</th>
                              <th scope="col" className="num">{t(lang, 'cases.scen.col.exposure')}</th>
                              <th scope="col" className="num">{t(lang, 'cases.scen.col.passed')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sum.listed.map((r) => (
                              <tr key={r.j} className={r.j === fi ? 'is-focus' : undefined}>
                                <td>{r.j === fi ? <><span className="lr-marker lr-marker--sm" aria-hidden />{' '}</> : null}{nm(r.j)}{r.onRoute ? <span className="st-onroute">{t(lang, 'cases.scen.onRoute')}</span> : null}</td>
                                <td className="num st-hide-sm">{fs(r.x)}</td>
                                <td className="num">{r.e == null ? t(lang, 'cases.scen.notInTable') : fs(r.e)}</td>
                                <td className="num">{r.passed == null ? '–' : fs(r.passed)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
          <p className="lr-caption">{t(lang, 'cases.scen.downCaption')} {t(lang, 'cases.scen.exposureNote', { product: mid(product.label, lang) })}</p>
        </div>
      ) : p.down.length ? (
        <p className="lr-caption st-scen__downnote">{t(lang, 'cases.scen.downBaseOnly', { product: p.products.find((x) => x.base)?.label ?? '' })}</p>
      ) : null}

      <p className="st-scen__caption">{t(lang, 'cases.scen.caption')}{bloc ? ` ${t(lang, 'cases.scen.blocRule', { s: supLabel })}` : ''}</p>
      {p.note ? <p className="lr-caption">{p.note}</p> : null}
      <div className="st-scen__foot">
        <span className="lr-caption">{p.source}</span>
        <CsvButton rows={csv} filename={`${p.caseId}-scenario-${product.id.replace(/[^A-Za-z0-9]+/g, '-')}-${sup}-${cut}`} label={t(lang, 'cases.fig.csv')} />
      </div>
    </section>
  );
}

function FillPanel({ lang, r, table, shocked, nm, fs, fp, kor }: {
  lang: Lang; r: ImporterResult; table: ScenarioTable; shocked: number[]; kor: number;
  nm: (i: number) => string; fs: (v: number | null | undefined) => string; fp: (v: number | null | undefined) => string;
}) {
  const buys = new Set(r.fill.map((f) => f.i));
  return (
    <div className="st-scen__fill">
      <p className="lr-card__h">{t(lang, 'cases.scen.fillH', { importer: nm(r.i), v: fs(r.risk) })}</p>
      {r.risk === 0 ? <p className="lr-caption">{t(lang, 'cases.scen.fillNone')}</p> : (
        <>
          <p className="lr-caption">{r.need == null ? t(lang, 'cases.scen.noOthersLong') : t(lang, 'cases.scen.fillNeed', { v: formatShare(r.need, lang, { decimals: 0 }) })}</p>
          <ul className="st-scen__list">
            {r.fill.slice(0, 8).map((f) => (
              <li key={f.i} className={f.i === kor ? 'is-focus' : undefined}>
                {nm(f.i)} <span className="lr-caption">{fs(f.share)}</span> <b>{fp(f.take)}</b>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="lr-card__h">{t(lang, 'cases.scen.largestOthers')}</p>
      <ul className="st-scen__list">
        {otherExporters(table, shocked).map(([i, s]) => (
          <li key={i}>{nm(i)} <b>{fs(s)}</b>{buys.has(i) ? <span className="lr-caption"> · {t(lang, 'cases.scen.alreadyBuys')}</span> : null}</li>
        ))}
      </ul>
    </div>
  );
}

function TariffTable({ lang, r, table, shocked, c, nm, fs, fp, kor }: {
  lang: Lang; r: ImporterResult; table: ScenarioTable; shocked: number[]; c: number; kor: number;
  nm: (i: number) => string; fs: (v: number | null | undefined) => string; fp: (v: number | null | undefined) => string;
}) {
  const shift = tariffShift(r, table, shocked, c);
  const S = new Set(shocked);
  // How much of this product each filling supplier itself buys from the shocked one (when it is a large importer).
  const own = (i: number) => {
    const imp = table.importers.find((x) => x.i === i);
    return imp ? imp.suppliers.filter(([k]) => S.has(k)).reduce((a, [, s]) => a + s, 0) : null;
  };
  return (
    <div className="lr-tablewrap">
      <table className="lr-table">
        <caption>{t(lang, 'cases.scen.tariffCaption', { importer: nm(r.i) })}</caption>
        <thead>
          <tr>
            <th scope="col">{t(lang, 'cases.scen.col.supplier')}</th>
            <th scope="col" className="num">{t(lang, 'cases.scen.col.now')}</th>
            <th scope="col" className="num">{t(lang, 'cases.scen.col.after')}</th>
            <th scope="col" className="num">{t(lang, 'cases.scen.col.pp')}</th>
            <th scope="col" className="num">{t(lang, 'cases.scen.col.own')}</th>
          </tr>
        </thead>
        <tbody>
          {shift.map((x) => (
            <tr key={x.i} className={x.i === kor ? 'is-focus' : undefined}>
              <td>{x.i === kor ? <><span className="lr-marker lr-marker--sm" aria-hidden />{' '}</> : null}{nm(x.i)}</td>
              <td className="num">{fs(x.now)}</td>
              <td className="num">{fs(x.after)}</td>
              <td className="num">{fp(x.after - x.now)}</td>
              <td className="num">{x.i === SMALLER || S.has(x.i) ? '' : fs(own(x.i))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
