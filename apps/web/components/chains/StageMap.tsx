'use client';
// The Stage map: the world map of one stage, drawn by <NetworkMap> from @larch/net. Each economy is a
// split node by default, imports as the left half-disc and exports as the right one on one scale, so big exporters,
// big importers and two-way traders read apart; a ring in the colour of the stage of this chain it leads, and a
// dashed rowan ring around an economy that ships more than half of the stage. Size: Split | Exports | Imports |
// Total. The focus economy (?focus=ISO3) is selected when there is one, and a click on an economy makes it the page's
// focus (a second click, Esc or "None" clears it). Beside the map: with no focus, the world and its top exporters;
// with one, the focus economy's panel (what the tooltip held, pinned, plus its top suppliers and buyers). Then the
// chokepoint note and the link that opens the stage in the explorer. The tooltip itself is brief: name, rank,
// exports and imports, beside the economy.
import { useEffect, useState } from 'react';
import { ExternalLink, X } from 'lucide-react';
import { NetworkMap } from '@larch/net';
import { Button, SegmentedControl, ShareBar, type Lang } from '@larch/ui';
import { t } from '@/lib/i18n';
import type { FocusStage, Partner } from './focus';
import { fmtHHI, fmtShare, fmtUSD, fmtUV } from './model';
import type { StageYear } from './types';

export type MapSize = 'split' | 'exports' | 'imports' | 'total';
export const MAP_SIZES: MapSize[] = ['split', 'exports', 'imports', 'total'];

/** The size key: two reference half-discs (imports left, exports right) or one circle. */
function SizeKey({ lang, size }: { lang: Lang; size: MapSize }) {
  if (size !== 'split') {
    return <p className="lr-caption">{t(lang, 'chains.map.legend.circle', { measure: t(lang, `chains.map.legend.m.${size}`) })}</p>;
  }
  return (
    <div className="ch-sizekey">
      <svg width="40" height="26" viewBox="-20 -13 40 26" aria-hidden>
        <path className="ln-half ln-half--m" d="M0,-11A11,11 0 0 0 0,11Z" />
        <path className="ln-half ln-half--x" d="M0,-11A11,11 0 0 1 0,11Z" />
      </svg>
      <span><b className="ch-sizekey__m">{t(lang, 'chains.map.legend.imports')}</b> | <b className="ch-sizekey__x">{t(lang, 'chains.map.legend.exports')}</b></span>
      <span className="lr-caption">{t(lang, 'chains.map.legend.split')}</span>
    </div>
  );
}

/** The focus economy at this stage, pinned: the tooltip's numbers, its rank beside the world total, its partners. */
function FocusPanel({ lang, name, iso, year, at, status, world, nodes, onClear }: {
  lang: Lang;
  name: string;
  iso: string;
  year: number;
  at: FocusStage | null;
  status: 'loading' | 'ready' | 'error';
  world: number | null;
  nodes: [string, string][];
  onClear: () => void;
}) {
  const n = at?.n ?? null;
  const partners = (title: string, list: Partner[]) => (list.length ? (
    <div className="ch-cpanel__list">
      <p className="ch-cpanel__lh">{title}</p>
      <ol>
        {list.map((p) => (
          <li key={p.i}><span className="lr-iso">{nodes[p.i]?.[0]}</span> {nodes[p.i]?.[1]} <b>{fmtShare(p.share, lang)}</b></li>
        ))}
      </ol>
    </div>
  ) : null);
  const rows: [string, string][] = n ? [
    [t(lang, 'chains.map.panel.exports'), fmtUSD(n.exports, lang)],
    [t(lang, 'chains.map.panel.imports'), fmtUSD(n.imports, lang)],
    [t(lang, 'chains.map.panel.net'), `${n.net > 0 ? '+' : n.net < 0 ? '−' : ''}${fmtUSD(Math.abs(n.net), lang)}`],
    [t(lang, 'chains.map.panel.share'), fmtShare(n.share, lang)],
    [t(lang, 'chains.map.panel.rank'), lang === 'ko' ? `${n.rankTotal}위` : `#${n.rankTotal}`],
    ...(n.exports > 0 && n.imports > 0 && n.gl != null ? [[t(lang, 'chains.map.panel.gl'), n.gl.toFixed(2)] as [string, string]] : []),
    ...(n.ux != null ? [[t(lang, 'chains.map.panel.ux'), fmtUV(n.ux, lang)] as [string, string]] : []),
    ...(n.um != null ? [[t(lang, 'chains.map.panel.um'), fmtUV(n.um, lang)] as [string, string]] : []),
    ...(n.topSup >= 0 && n.topSupShare != null ? [[t(lang, 'chains.map.panel.topSup', { name: nodes[n.topSup]?.[0] ?? '' }), fmtShare(n.topSupShare, lang)] as [string, string]] : []),
  ] : [];
  return (
    <div className="ch-cpanel">
      <div className="ch-cpanel__head">
        <p className="ch-cpanel__name"><span className="lr-marker lr-marker--sm" aria-hidden /> {name} <span className="lr-iso">{iso}</span></p>
        <button type="button" className="lr-iconbtn ch-cpanel__clear" aria-label={t(lang, 'chains.focus.clear')} title={t(lang, 'chains.focus.clear')} onClick={onClear}>
          <X size={16} strokeWidth={1.5} aria-hidden />
        </button>
      </div>
      {status !== 'ready' ? (
        <p className="lr-caption">{t(lang, status === 'error' ? 'chains.focus.error' : 'chains.focus.loading', { name })}</p>
      ) : !n ? (
        <p className="ch-stagemap__world">{t(lang, 'chains.map.panel.none', { name, year })}</p>
      ) : (
        <>
          <p className="ch-stagemap__world">
            {t(lang, 'chains.map.panel.context', {
              world: world != null ? fmtUSD(world, lang) : '–', name,
              xr: n.exports > 0 ? n.rankExports : '–', mr: n.imports > 0 ? n.rankImports : '–',
            })}
          </p>
          <dl className="ch-cpanel__dl">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
          {partners(t(lang, 'chains.map.panel.sup'), at!.sup)}
          {partners(t(lang, 'chains.map.panel.buy'), at!.buy)}
        </>
      )}
    </div>
  );
}

export function StageMap({ lang, product, productName, year, data, nodes, chokepoint, exploreHref, focus, focusName, focusAt, focusStatus, onFocus, size, onSize }: {
  lang: Lang;
  /** The stage's product id ("C:batteries:cathode"). */
  product: string;
  productName: string;
  year: number;
  data: StageYear | null;
  nodes: [string, string][];
  /** This stage is the chain's chokepoint in `year`. */
  chokepoint: boolean;
  /** "/en/explore#p=C:batteries:cathode&t=2024". */
  exploreHref: string;
  /** The page's focus economy (ISO3), selected on the map; null selects nothing. */
  focus: string | null;
  focusName: string | null;
  /** The focus economy at this stage (null without trade) and whether it has loaded. */
  focusAt: FocusStage | null;
  focusStatus: 'loading' | 'ready' | 'error';
  /** A click on an economy (or on the selected one again, or on the sea: null). */
  onFocus: (iso: string | null) => void;
  size: MapSize;
  onSize: (s: MapSize) => void;
}) {
  // a clicked flow is the map's own; a click on an economy goes to the page
  const [flow, setFlow] = useState<string | null>(null);
  useEffect(() => { setFlow(null); }, [focus]);
  const top = data?.top_exporters[0];
  return (
    <div className="ch-stagemap__view">
      <div className="ch-stagemap__map">
        <NetworkMap
          lang={lang}
          product={product}
          period={year}
          colorBy="stage"
          sizeBy={size}
          focus={flow ? null : focus}
          flow={flow}
          onSelect={(s) => { if (s.flow) setFlow(s.flow); else { setFlow(null); onFocus(s.focus); } }}
          tip="brief"
          height="clamp(260px, 52vw, 470px)"
          className="ch-map"
        />
      </div>
      <div className="ch-stagemap__side">
        <SegmentedControl<MapSize>
          label={t(lang, 'chains.map.size')}
          value={size}
          onChange={onSize}
          options={MAP_SIZES.map((v) => ({ value: v, label: t(lang, `chains.map.size.${v}`) }))}
        />
        <SizeKey lang={lang} size={size} />
        <p className="ch-fig__title">{t(lang, 'chains.map.flowsTitle', { product: productName, year })}</p>
        {focus && focusName ? (
          <FocusPanel lang={lang} name={focusName} iso={focus} year={year} at={focusAt} status={focusStatus} world={data?.world ?? null}
            nodes={nodes} onClear={() => onFocus(null)} />
        ) : data ? (
          <>
            <p className="ch-stagemap__world">{t(lang, 'chains.stage.world', { year })}: <b>{fmtUSD(data.world, lang)}</b></p>
            <ShareBar lang={lang} title={t(lang, 'chains.stage.topExporters', { year })}
              shares={data.top_exporters.slice(0, 5).map(([i, sh]) => ({ label: nodes[i]?.[0] ?? '?', share: sh }))} />
          </>
        ) : null}
        {chokepoint && data && top ? (
          <p className="ch-mapslot__choke">{t(lang, 'chains.map.chokeNote', { product: productName, year, hhi: fmtHHI(data.hhi), top: nodes[top[0]]?.[0] ?? '', share: fmtShare(top[1], lang) })}</p>
        ) : null}
        <p className="lr-caption">{t(lang, size === 'split' ? 'chains.map.note' : 'chains.map.noteFull')}</p>
        <Button href={exploreHref} variant="secondary" size="sm" icon={<ExternalLink size={16} strokeWidth={1.5} aria-hidden />}>
          {t(lang, 'chains.map.open')}
        </Button>
      </div>
    </div>
  );
}
