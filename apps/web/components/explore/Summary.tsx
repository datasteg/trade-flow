// The explorers' server-rendered summary: the explorer keeps its state in the
// URL hash, which crawlers ignore, so the page carries the period's world total, the ten largest flows and the
// product list as real links before any script runs. The links use the query forms the Explorer seeds from
// (?p=, ?flow=A-B); the canonical stays the bare page.
import type { Meta } from '@larch/net/core';
import { formatNumber, formatUSD, t, type Lang } from '@/lib/i18n';
import type { ExploreMode } from './state';

export interface SummaryFlow { a: string; b: string; aName: string; bName: string; value: number }
export interface SummaryProduct { id: string; name: string; kind: string }

const KINDS = ['total', 'chapter', 'basket', 'stage'] as const;
const GROUP_KEY = { total: 'explore.group.total', chapter: 'explore.group.chapters', basket: 'explore.group.baskets', stage: 'explore.group.chains' } as const;

export function ExploreSummary({ lang, mode, period, world, economies, flows, top, products, source }: {
  lang: Lang;
  mode: ExploreMode;
  /** The period in words ("2024", "Jul 2026"). */
  period: string;
  world: number;
  economies: number;
  flows: number;
  top: SummaryFlow[];
  products: SummaryProduct[];
  source: string;
}) {
  const base = `/${lang}/${mode === 'windows' ? 'explore-monthly' : 'explore'}`;
  const usd = (v: number) => formatUSD(v, lang);
  return (
    <section className="gx-summary page" aria-labelledby="gx-summary-h">
      <h2 id="gx-summary-h">{t(lang, 'explore.sum.h', { period })}</h2>
      <p className="gx-summary__lede">
        {t(lang, mode === 'windows' ? 'explore.sum.worldW' : 'explore.sum.world', {
          period, world: usd(world), n: formatNumber(economies, lang), flows: formatNumber(flows, lang),
        })}
      </p>
      {top.length ? (
        <>
          <h3 className="gx-summary__group">{t(lang, 'explore.sum.flows')}</h3>
          <ol className="gx-summary__flows">
            {top.map((f) => (
              <li key={`${f.a}>${f.b}`}>
                <a href={`${base}?flow=${f.a}-${f.b}`}>{f.aName} → {f.bName}</a> <span className="gx-muted">{usd(f.value)}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}
      <h3 className="gx-summary__group">{t(lang, 'explore.sum.products')}</h3>
      {KINDS.map((k) => {
        const list = products.filter((p) => p.kind === k);
        if (!list.length) return null;
        return (
          <div key={k}>
            <p className="gx-summary__kind">{t(lang, GROUP_KEY[k])}</p>
            <ul className="gx-summary__products">
              {list.map((p) => <li key={p.id}><a href={p.id === 'TOTAL' ? base : `${base}?p=${p.id}`}>{p.name}</a></li>)}
            </ul>
          </div>
        );
      })}
      <p className="lr-caption gx-summary__source">{source}</p>
    </section>
  );
}

/** The `n` largest flows of a stored snapshot (rows follow `ecols`), named in the page language. */
export function topFlows(edges: (number | null)[][], ecols: string[], world: number, meta: Meta, lang: Lang, n = 10): SummaryFlow[] {
  const si = ecols.indexOf('s'), ti = ecols.indexOf('t'), wi = ecols.indexOf('w');
  const name = (i: number) => meta.nodes[i]?.[lang] ?? meta.nodes[i]?.en ?? String(i);
  return [...edges]
    .filter((e) => (e[wi] ?? 0) > 0)
    .sort((a, b) => (b[wi] ?? 0) - (a[wi] ?? 0))
    .slice(0, n)
    .map((e) => {
      const a = e[si] as number, b = e[ti] as number;
      return { a: meta.nodes[a]?.id ?? String(a), b: meta.nodes[b]?.id ?? String(b), aName: name(a), bName: name(b), value: (e[wi] ?? 0) * world };
    });
}

/** The explorer's products as links: all of them, or only those with monthly windows (`windowsOnly`). */
export function productList(meta: Meta, lang: Lang, windowsOnly: boolean): SummaryProduct[] {
  return meta.products.filter((p) => !windowsOnly || p.W).map((p) => ({ id: p.id, name: p[lang] || p.en, kind: p.kind }));
}
