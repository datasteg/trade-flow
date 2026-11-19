'use client';
// The ChainTrail: one column per rung of the chain's ladder (chains.yaml `levels`), each rung's products as
// waypoints, and the feeds between them drawn after layout (design book 03-Product-chains and components/ChainTrail).
// Side inputs and feedstocks sit in a row above the trail and join it with dashed lines. A ladder longer than
// LONG_LADDER draws compact waypoints and scrolls sideways inside its own region; below 720px the columns stack and
// the feeds hide: the order alone carries the flow. With a focus economy each card adds its export share and rank.
import { useLayoutEffect, useRef, useState } from 'react';
import { HSCode, ShareBar, type Lang } from '@larch/ui';
import { t } from '@/lib/i18n';
import { fmtHHI, fmtShare, fmtUSD, fmtUV, LONG_LADDER, rungs, stageTag, stageVar, uvShown } from './model';
import type { FocusSnaps } from './focus';
import type { ChainModel, StageModel, StageYear, YearSlice } from './types';

interface Feed { d: string; dashed: boolean }

/** The focus economy on the cards: its ISO3 and its numbers at every stage. */
export interface TrailFocus { iso: string; snaps: FocusSnaps | null }

/** "KOR 25% of exports · #1" on a card; "KOR: no exports"; "KOR …" while loading. */
function FocusLine({ lang, focus, k }: { lang: Lang; focus: TrailFocus; k: string }) {
  const sn = focus.snaps;
  const n = sn?.status === 'ready' ? sn.at[k]?.n ?? null : null;
  const text = sn?.status !== 'ready' ? `${focus.iso} …`
    : n && n.exports > 0 ? t(lang, 'chains.way.focus', { iso: focus.iso, share: fmtShare(n.x, lang), rank: n.rankExports })
      : t(lang, 'chains.way.focusNone', { iso: focus.iso });
  return <p className="ch-way__focus"><span className="lr-marker lr-marker--sm" aria-hidden /> {text}</p>;
}

function Waypoint({ lang, s, y, year, choke, nodes, inline, focus }: {
  lang: Lang;
  s: StageModel;
  y: StageYear | null;
  year: number;
  choke: boolean;
  nodes: [string, string][];
  /** The copy of a side card shown inside its column on phones (no data-key: feeds measure the row above). */
  inline?: boolean;
  focus: TrailFocus | null;
}) {
  const side = s.role !== null;
  const cls = ['lr-way', choke ? 'lr-way--choke' : '', side ? 'ch-way--side' : '', y ? '' : 'ch-way--nodata', inline ? 'ch-way--inline' : ''].filter(Boolean).join(' ');
  const top = y?.top_exporters[0];
  const use = s.use;
  return (
    <div className={cls} data-key={inline ? undefined : s.key}>
      {side ? <p className="ch-way__role">{t(lang, s.role === 'feedstock' ? 'chains.way.feedstock' : 'chains.way.side')}</p> : null}
      <p className="lr-way__name"><a href={`#stage-${s.key}`}>{s.name}</a></p>
      <div className="lr-way__codes">
        {s.codes.map((c) => <HSCode key={c} lang={lang} code={c} residual={s.residual} version={s.codesPre ? 'H6' : undefined} />)}
        {(s.codesPre ?? []).map((c) => <HSCode key={`p${c}`} lang={lang} code={c} version="H5" />)}
      </div>
      {y ? (
        <>
          <div className="lr-way__nums">
            <span>
              <b>{fmtUSD(y.world, lang)}</b>
              {uvShown(y) ? <> · <b>{fmtUV(y.usd_per_kg, lang)}</b></> : null}
            </span>
            {top ? <span>{nodes[top[0]]?.[0]} <b>{fmtShare(top[1], lang)}</b></span> : null}
          </div>
          <ShareBar lang={lang} compact shares={y.top_exporters.slice(0, 5).map(([i, sh]) => ({ label: nodes[i]?.[0] ?? '?', share: sh }))} />
          {focus ? <FocusLine lang={lang} focus={focus} k={s.key} /> : null}
        </>
      ) : (
        <p className="ch-way__nodata">
          {s.first != null && s.first > year ? t(lang, 'chains.way.begins', { year: s.first }) : t(lang, 'chains.way.noTrade', { year })}
        </p>
      )}
      {choke && y ? <span className="lr-way__choke">{t(lang, 'chains.way.choke', { hhi: fmtHHI(y.hhi) })}</span> : null}
      {use ? (
        <span className="ch-use" title={[use.what, use.source].filter(Boolean).join(' · ')}>
          {use.share == null
            ? t(lang, 'chains.use.unknown')
            : t(lang, use.short && use.year ? 'chains.use.badge' : 'chains.use.badgeNoYear', {
              share: fmtShare(use.share, lang), source: use.short ?? '', year: use.year ?? '',
            })}
        </span>
      ) : null}
      {s.shared.map((x) => (
        <a key={x.chain} className="ch-also" href={x.href}>{t(lang, 'chains.way.also', { chain: x.name })}</a>
      ))}
    </div>
  );
}

export function ChainTrail({ lang, levels, stages, slice, year, choke, nodes, focus = null }: {
  lang: Lang;
  levels: ChainModel['levels'];
  stages: StageModel[];
  slice: YearSlice;
  year: number;
  choke: string | null;
  nodes: [string, string][];
  focus?: TrailFocus | null;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [size, setSize] = useState<[number, number]>([0, 0]);
  const n = levels.length;
  const long = n > LONG_LADDER;
  const sides = stages.filter((s) => s.role !== null);
  const hasSides = sides.length > 0;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const draw = () => {
      const r0 = el.getBoundingClientRect();
      setSize([r0.width, r0.height]);
      if (!svg.current || getComputedStyle(svg.current).display === 'none') { setFeeds([]); return; }
      const card = (k: string) => el.querySelector<HTMLElement>(`[data-key="${CSS.escape(k)}"]`)?.getBoundingClientRect();
      const out: Feed[] = [];
      for (const s of stages) {
        const a = card(s.key);
        if (!a) continue;
        for (const f of s.feeds) {
          const b = card(f);
          if (!b) continue;
          const y1 = a.top + a.height / 2 - r0.top, y2 = b.top + b.height / 2 - r0.top;
          let d: string;
          if (b.left >= a.right - 1) {
            const x1 = a.right - r0.left, x2 = b.left - r0.left, mx = (x1 + x2) / 2;
            d = `M${x1},${y1}C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
          } else if (Math.abs(b.left - a.left) < 4) {
            // Same column: a bracket on the right edge, in the gap between columns.
            const x1 = a.right - r0.left, x2 = b.right - r0.left, bx = Math.max(x1, x2) + 9;
            d = `M${x1},${y1}C${bx},${y1} ${bx},${y2} ${x2},${y2}`;
          } else continue;
          out.push({ d, dashed: s.role !== null });
        }
      }
      setFeeds(out);
    };
    draw();
    const ro = new ResizeObserver(draw);
    ro.observe(el);
    document.fonts?.ready.then(draw).catch(() => {});
    return () => ro.disconnect();
  }, [stages, slice, focus]);

  const byStage = (k: number, side: boolean) => stages.filter((s) => s.stage === k && (s.role !== null) === side);
  const trail = (
    <div className={long ? 'ch-trailwrap ch-trailwrap--long' : 'ch-trailwrap'} ref={wrap} style={{ ['--levels' as string]: n }}>
      <svg ref={svg} className="lr-trail__feeds" width={size[0]} height={size[1]} aria-hidden>
        {feeds.map((f, i) => <path key={i} d={f.d} className={f.dashed ? 'ch-feed--side' : undefined} />)}
      </svg>
      {hasSides ? (
        <div className="ch-sides">
          {rungs(n).map((k) => (
            <div key={k} className="ch-sides__col">
              {byStage(k, true).map((s) => (
                <Waypoint key={s.key} lang={lang} s={s} y={slice[s.key]} year={year} choke={false} nodes={nodes} focus={focus} />
              ))}
            </div>
          ))}
        </div>
      ) : null}
      <div className="lr-trail">
        {rungs(n).map((k) => {
          const main = byStage(k, false);
          const side = byStage(k, true);
          return (
            <div key={k} className="lr-trail__col">
              <div className="lr-trail__stage" style={{ ['--stage' as string]: stageVar(k, n) }}>
                <span className="lr-marker" />
                <b>{stageTag(lang, k)}</b> {levels[k - 1].name}
              </div>
              {side.map((s) => (
                <Waypoint key={`i-${s.key}`} lang={lang} s={s} y={slice[s.key]} year={year} choke={false} nodes={nodes} inline focus={focus} />
              ))}
              {main.length ? main.map((s) => (
                <Waypoint key={s.key} lang={lang} s={s} y={slice[s.key]} year={year} choke={choke === s.key} nodes={nodes} focus={focus} />
              )) : (
                <div className={side.length ? 'lr-way lr-way--empty ch-way--feedonly' : 'lr-way lr-way--empty'}>{t(lang, side.length ? 'chains.way.feedOnly' : 'chains.way.empty')}</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
  return long
    ? <div className="ch-trailscroll" role="region" aria-label={t(lang, 'chains.sankey.scroll')} tabIndex={0}>{trail}</div>
    : trail;
}
