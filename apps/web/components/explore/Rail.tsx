'use client';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Search, Table2, Map as MapIcon, Maximize2 } from 'lucide-react';
import { Legend, LegendItem, LegendNote, LegendRamp, LegendRow, LegendTitle, SegmentedControl, stageLabel } from '@larch/ui';
import {
  CHANGE_TOKENS, HHI_TOKENS, groupName, halfDisc, isGrouping, stageToken, type ColorBy, type GroupColouring, type GroupsFile, type Meta,
  type MetaProduct, type SizeBy, type Snap,
} from '@larch/net/core';
import { formatDate, formatPeriod, formatShare, formatUSD, t, type Lang } from '@/lib/i18n';
import { ProductPicker, type ChainName } from './ProductPicker';
import { BLOCS, CLUBS, COLOR_MODES, LABEL_STEPS, MIN_STEPS, SIZE_MODES, WINDOWS, lagText, type ExploreMode, type ExploreState } from './state';

export interface LegendKeys {
  /** Nested reference circles: value and radius. */
  sizes: { value: number; r: number; text: string }[];
  /** Reference flow widths. */
  widths: { value: number; w: number }[];
  /** Community slots now: anchor name, size, share, slot. */
  communities: { name: string; size: number; share: number; slot: number }[];
  chokepoints: string[];
  /** Grouping colours: per group, the member economies trading the product and their share of world trade. */
  groups: Record<string, { n: number; share: number }>;
}

function Select<V extends string | number>({ label, value, options, onChange, disabled, note }: {
  label: ReactNode; value: V; options: { value: V; label: string; disabled?: boolean }[]; onChange: (v: V) => void; disabled?: boolean; note?: ReactNode;
}) {
  const id = useId();
  return (
    <div className="lr-field">
      <label className="lr-label" htmlFor={id}>{label}</label>
      <select id={id} className="gx-select" value={String(value)} disabled={disabled}
        onChange={(e) => { const o = options.find((x) => String(x.value) === e.target.value); if (o) onChange(o.value); }}>
        {options.map((o) => <option key={String(o.value)} value={String(o.value)} disabled={o.disabled}>{o.label}</option>)}
      </select>
      {note ? <p className="gx-note">{note}</p> : null}
    </div>
  );
}

export function minLabel(min: number, lang: Lang): string {
  if (!min) return t(lang, 'explore.floorNone');
  const d = Math.max(0, Math.ceil(-Math.log10(min * 100) + 1e-9));
  return formatShare(min, lang, { decimals: d });
}

export function Rail(p: {
  lang: Lang;
  meta: Meta;
  chains: ChainName[];
  st: ExploreState;
  set: (patch: Partial<ExploreState>) => void;
  product: MetaProduct;
  snap: Snap | null;
  periods: number[];
  colorBy: ColorBy;
  sizeBy: SizeBy;
  keys: LegendKeys;
  groups: GroupColouring | null;
  groupsFile: GroupsFile | null;
  onFit: () => void;
  onFind: (iso: string) => void;
  findRef?: React.RefObject<HTMLInputElement | null>;
  /** Speed control (in the sheet below 720px). */
  speed?: ReactNode;
  /** "windows": the monthly explorer's controls (window, comparison, estimates); the explorer itself has years only. */
  mode?: ExploreMode;
}) {
  const { lang, meta, st, set, product, snap } = p;
  const win = p.mode === 'windows';
  const full = snap ? snap.full : win ? st.w === 12 : true;
  const isTotal = product.id === 'TOTAL';
  const nameOf = (iso: string | null) => { if (!iso) return ''; const n = meta.nodes.find((x) => x.id === iso); return n ? n[lang] : iso; };

  return (
    <div className="gx-rail__inner">
      <ProductPicker lang={lang} meta={meta} chains={p.chains} value={st.p} onChange={(id) => set({ p: id, focus: null, flow: null })} />

      {win ? (
        <>
          <div className="lr-field">
            <SegmentedControl label={t(lang, 'explore.w.windowLabel')} value={String(st.w)}
              options={WINDOWS.map((w) => ({ value: String(w), label: t(lang, 'explore.w.months', { w }) }))}
              onChange={(w) => set({ w: Number(w) as ExploreState['w'] })} />
            <p className="gx-note">{t(lang, 'explore.w.windowNote', { w: st.w, lag: lagText(lang, st.w) })}
              {st.w < 12 ? ` ${t(lang, 'explore.w.noNetworkMetrics')}` : ''}</p>
          </div>
          <SegmentedControl label={t(lang, 'explore.w.cmpLabel')} value={st.cmp}
            options={[{ value: 'yoy', label: t(lang, 'explore.w.cmpYoy') }, { value: 'base', label: t(lang, 'explore.w.cmpBase') }]}
            onChange={(cmp) => set({ cmp })} />
          <label className="gx-check">
            <input type="checkbox" checked={st.est} onChange={(e) => set({ est: e.target.checked })} />
            <span>{t(lang, 'explore.w.showEst')}</span>
          </label>
        </>
      ) : null}

      <SegmentedControl label={t(lang, 'explore.layout')} value={st.l}
        options={[{ value: 'map', label: t(lang, 'explore.map') }, { value: 'force', label: t(lang, 'explore.force') }]}
        onChange={(l) => set({ l })} />

      <Select label={t(lang, 'explore.colourBy')} value={st.c}
        options={COLOR_MODES.map((c) => ({ value: c, label: t(lang, `explore.c.${c}`), disabled: c === 'stage' && product.kind !== 'stage' }))}
        onChange={(c) => set({ c })}
        note={st.c === 'community' && p.colorBy !== 'community' ? t(lang, 'explore.communityNotHere') : st.c === 'stage' && product.kind !== 'stage' ? t(lang, 'explore.stageNotHere') : undefined} />
      {st.c === 'bloc' ? <BlocPicker lang={lang} file={p.groupsFile} value={st.blocs} onChange={(blocs) => set({ blocs })} overlaps={p.groups?.overlaps ?? 0} /> : null}
      {st.c === 'club' ? (
        <Select label={t(lang, 'explore.club')} value={st.club}
          options={CLUBS.map((k) => ({ value: k, label: p.groupsFile ? groupName(p.groupsFile, k, lang) : k }))} onChange={(club) => set({ club })} />
      ) : null}
      {st.c === 'custom' ? <CustomList lang={lang} meta={meta} value={st.custom} onChange={(custom) => set({ custom })} /> : null}
      {st.c === 'bloc' || st.c === 'club' ? (
        <label className="gx-check">
          <input type="checkbox" checked={st.mt} onChange={(e) => set({ mt: e.target.checked })} />
          <span>{t(lang, 'explore.today')}</span>
        </label>
      ) : null}
      {st.c === 'change' && win && st.cmp === 'yoy' ? <p className="gx-note">{t(lang, 'explore.w.yoyNote')}</p> : null}
      {st.c === 'change' && !(win && st.cmp === 'yoy') ? (
        <Select label={t(lang, 'explore.base')} value={st.base} options={p.periods.map((x) => ({ value: x, label: formatPeriod(x, lang) }))} onChange={(base) => set({ base })} />
      ) : null}

      <div className="gx-row">
        <Select label={t(lang, 'explore.size')} value={st.s}
          options={SIZE_MODES.map((s) => ({ value: s, label: t(lang, `explore.s.${s}`), disabled: !full && (s === 'pagerank' || s === 'betweenness') }))}
          onChange={(s) => set({ s })} />
        <Select label={t(lang, 'explore.scale')} value={st.sc}
          options={[{ value: 'fixed', label: t(lang, 'explore.fixed') }, { value: 'period', label: t(lang, 'explore.perPeriod') }]}
          onChange={(sc) => set({ sc })} />
      </div>
      {!full && (st.s === 'pagerank' || st.s === 'betweenness') ? <p className="gx-note">{t(lang, 'explore.sizeNotHere')}</p> : null}

      <div className="lr-field">
        <span className="lr-label">{t(lang, 'explore.flows')}</span>
        <div className="gx-row gx-row--flows">
          <label className="gx-range">
            <span>{t(lang, 'explore.flowsPer', { k: st.k })}</span>
            <input type="range" min={1} max={10} step={1} value={st.k} onChange={(e) => set({ k: Number(e.target.value) })} aria-label={t(lang, 'explore.flowsPer', { k: st.k })} />
          </label>
          <Select label={t(lang, 'explore.floor')} value={st.min} options={MIN_STEPS.map((m) => ({ value: m, label: minLabel(m, lang) }))} onChange={(min) => set({ min })} />
        </div>
      </div>

      <div className="gx-row">
        <Select label={t(lang, 'explore.labels')} value={st.lab}
          options={LABEL_STEPS.map((n) => ({ value: n, label: n === 0 ? t(lang, 'explore.labelsNone') : n >= 999 ? t(lang, 'explore.labelsAll') : String(n) }))}
          onChange={(lab) => set({ lab })} />
        {isTotal && st.f === 'A' ? (
          <Select label={t(lang, 'explore.rule')} value={st.m}
            options={(['mirror', 'importer', 'exporter'] as const).map((m) => ({ value: m, label: t(lang, `explore.rule.${m}`) }))}
            onChange={(m) => set({ m })} />
        ) : <div />}
      </div>
      <p className="gx-note">{st.f === 'M' ? t(lang, 'explore.ruleMonthly') : t(lang, 'explore.ruleTotalOnly')}</p>

      {p.speed}

      <FindEconomy lang={lang} meta={meta} snap={snap} onFind={p.onFind} inputRef={p.findRef} />

      <div className="gx-row gx-row--buttons">
        <button type="button" className="lr-btn lr-btn--secondary lr-btn--sm" aria-pressed={st.tbl} onClick={() => set({ tbl: !st.tbl })}>
          {st.tbl ? <MapIcon size={16} strokeWidth={1.5} aria-hidden /> : <Table2 size={16} strokeWidth={1.5} aria-hidden />}
          {t(lang, st.tbl ? 'explore.showMap' : 'explore.showTable')}
        </button>
        <button type="button" className="lr-btn lr-btn--quiet lr-btn--sm" onClick={p.onFit}><Maximize2 size={16} strokeWidth={1.5} aria-hidden />{t(lang, 'explore.fit')}</button>
      </div>

      <MapLegend lang={lang} meta={meta} st={st} colorBy={p.colorBy} sizeBy={p.sizeBy} keys={p.keys} focusName={nameOf(st.focus)} snap={snap}
        groups={p.groups} groupsFile={p.groupsFile} ladder={p.chains.find((c) => c.id === product.chain)?.levels ?? []} />
    </div>
  );
}

/** The trade blocs to colour, as toggles in the reader's order: a click adds a bloc at the end or removes it. */
function BlocPicker({ lang, file, value, onChange, overlaps }: { lang: Lang; file: GroupsFile | null; value: string[]; onChange: (v: string[]) => void; overlaps: number }) {
  const id = useId();
  return (
    <div className="lr-field">
      <span className="lr-label" id={id}>{t(lang, 'explore.blocs')}</span>
      <div className="gx-blocs" role="group" aria-labelledby={id}>
        {BLOCS.map((k) => {
          const at = value.indexOf(k);
          const colour = file?.groups[k]?.colour ?? 'viz-context';
          return (
            <button key={k} type="button" className="gx-bloc" aria-pressed={at >= 0}
              onClick={() => onChange(at >= 0 ? value.filter((x) => x !== k) : [...value, k])}>
              <span className="gx-bloc__key" style={{ background: at >= 0 ? `var(--${colour})` : 'transparent', borderColor: `var(--${colour})` }} aria-hidden />
              {at >= 0 ? <b className="gx-bloc__n">{at + 1}</b> : null}
              {file ? groupName(file, k, lang) : k}
            </button>
          );
        })}
      </div>
      {overlaps > 0 ? <p className="gx-note">{t(lang, 'explore.blocsOverlap', { n: overlaps })}</p> : null}
    </div>
  );
}

/** The reader's own list: ISO3 codes typed in, kept in the URL. */
function CustomList({ lang, meta, value, onChange }: { lang: Lang; meta: Meta; value: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value.join(', '));
  const [bad, setBad] = useState<string[]>([]);
  const id = useId();
  const apply = () => {
    const codes = [...new Set(text.toUpperCase().split(/[\s,;]+/).filter(Boolean))];
    const known = codes.filter((c) => meta.nodes.some((n) => n.id === c));
    setBad(codes.filter((c) => !known.includes(c)));
    onChange(known);
  };
  return (
    <div className="lr-field">
      <label className="lr-label" htmlFor={id}>{t(lang, 'explore.custom')}</label>
      <div className="gx-row gx-row--custom">
        <input id={id} className="gx-input" value={text} placeholder={t(lang, 'explore.customPlaceholder')}
          onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); apply(); } }} onBlur={apply} />
        <button type="button" className="lr-btn lr-btn--secondary lr-btn--sm" onClick={apply}>{t(lang, 'explore.customApply')}</button>
      </div>
      {bad.length ? <p className="gx-note">{t(lang, 'explore.customUnknown', { list: bad.join(', ') })}</p> : null}
    </div>
  );
}

function FindEconomy({ lang, meta, snap, onFind, inputRef }: { lang: Lang; meta: Meta; snap: Snap | null; onFind: (iso: string) => void; inputRef?: React.RefObject<HTMLInputElement | null> }) {
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const id = useId();
  const own = useRef<HTMLInputElement>(null);
  const ref = inputRef ?? own;
  const all = useMemo(() => {
    // economies only: a partner area that is not an economy (Asia, n.e.s.) cannot be found or focused
    const ranked = snap ? [...snap.nodes].filter((n) => !n.nes).sort((a, b) => a.rankTotal - b.rankTotal).map((n) => n.i) : [];
    const seen = new Set(ranked);
    const rest = meta.nodes.map((_n, i) => i).filter((i) => !seen.has(i) && !meta.nodes[i].hist && !meta.nodes[i].nes);
    return [...ranked, ...rest];
  }, [snap, meta]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return all.filter((i) => {
      const n = meta.nodes[i];
      return n.id.toLowerCase().startsWith(s) || n.en.toLowerCase().includes(s) || n.ko.includes(q.trim()) || (n.name ?? '').toLowerCase().includes(s);
    }).slice(0, 8);
  }, [q, all, meta]);
  const choose = (i: number | undefined) => {
    if (i == null) return;
    onFind(meta.nodes[i].id);
    setQ('');
  };
  return (
    <div className="lr-field gx-find">
      <div className="lr-search">
        <Search size={18} strokeWidth={1.5} aria-hidden />
        <input ref={ref} type="search" value={q} placeholder={t(lang, 'explore.find')} aria-label={t(lang, 'explore.find')}
          role="combobox" aria-expanded={matches.length > 0} aria-controls={`${id}-l`} aria-autocomplete="list"
          aria-activedescendant={matches[active] != null ? `${id}-${active}` : undefined}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(matches.length - 1, a + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === 'Enter') { e.preventDefault(); choose(matches[active]); }
            else if (e.key === 'Escape') { setQ(''); }
          }} />
        <kbd aria-hidden>/</kbd>
      </div>
      {q.trim() ? (
        <ul id={`${id}-l`} role="listbox" className="gx-find__list">
          {matches.length ? matches.map((i, k) => (
            <li key={i} id={`${id}-${k}`} role="option" aria-selected={k === active} className={k === active ? 'is-active' : undefined}
              onMouseDown={(e) => e.preventDefault()} onClick={() => choose(i)} onMouseEnter={() => setActive(k)}>
              <span>{meta.nodes[i][lang]}</span><span className="lr-iso">{meta.nodes[i].id}</span>
            </li>
          )) : <li className="gx-find__empty">{t(lang, 'explore.findNone')}</li>}
        </ul>
      ) : null}
    </div>
  );
}

function MapLegend({ lang, meta, st, colorBy, sizeBy, keys, focusName, snap, groups, groupsFile, ladder }: {
  lang: Lang; meta: Meta; st: ExploreState; colorBy: ColorBy; sizeBy: SizeBy; keys: LegendKeys; focusName: string; snap: Snap | null;
  groups: GroupColouring | null; groupsFile: GroupsFile | null;
  /** Stage colouring: the rungs of the product's chain (names in both languages), from chains/index.json. */
  ladder: { en: string; ko: string }[];
}) {
  const measure = t(lang, `explore.s.${sizeBy}`);
  const split = sizeBy === 'split';
  const valueMeasure = sizeBy === 'total' || split || sizeBy === 'exports' || sizeBy === 'imports';
  const maxR = Math.max(1, ...keys.sizes.map((x) => x.r));
  void meta;
  return (
    <Legend className="gx-legend">
      <LegendTitle>{t(lang, 'explore.legend')}</LegendTitle>
      {st.focus ? (
        <>
          <span className="lr-legend__item"><span className="lr-legend__dot" style={{ background: 'var(--node-selected)', boxShadow: '0 0 0 2px var(--ink)' }} aria-hidden />{t(lang, 'explore.legendSelected', { name: focusName })}</span>
          <LegendRow>
            <LegendItem swatch="line" colour="flow-out">{t(lang, 'explore.legendItsExports')}</LegendItem>
            <LegendItem swatch="line" colour="flow-in">{t(lang, 'explore.legendItsImports')}</LegendItem>
          </LegendRow>
        </>
      ) : null}
      {colorBy === 'community' ? (
        <div className="gx-legend__list">
          {keys.communities.map((c) => (
            <LegendItem key={c.slot} colour={`viz-${c.slot + 1}`}>
              {t(lang, 'explore.legendCommunity', { name: c.name })} <span className="gx-muted">{t(lang, 'explore.legendCommunityMeta', { n: c.size, share: formatShare(c.share, lang) })}</span>
            </LegendItem>
          ))}
          <LegendItem colour="viz-context">{t(lang, 'explore.legendOtherComm')}</LegendItem>
          <LegendNote>{t(lang, 'explore.legendCommNote')}</LegendNote>
        </div>
      ) : null}
      {isGrouping(colorBy) && groups && groupsFile ? (
        <div className="gx-legend__list">
          {groups.keys.map((k) => (
            <LegendItem key={k} colour={groups.colours[k]}>
              {groupName(groupsFile, k, lang)} <span className="gx-muted">{t(lang, 'explore.legendGroupMeta', { n: keys.groups[k]?.n ?? 0, share: formatShare(keys.groups[k]?.share ?? 0, lang) })}</span>
            </LegendItem>
          ))}
          <LegendItem colour="viz-context">{t(lang, 'explore.legendOthers')}</LegendItem>
          <LegendNote>
            {t(lang, 'explore.legendGroupFlows')}{' '}
            {colorBy === 'region' ? t(lang, 'explore.legendRegions')
              : groups.date ? t(lang, st.mt ? 'explore.legendAsOfToday' : 'explore.legendAsOf', { date: formatDate(groups.date, lang) }) : ''}
          </LegendNote>
        </div>
      ) : null}
      {colorBy === 'change' ? (
        <div className="gx-legend__list">
          <span>{t(lang, 'explore.legendChange', { measure, t: formatPeriod(st.t, lang), base: formatPeriod(st.base, lang) })}</span>
          <LegendRamp colours={CHANGE_TOKENS} labels={['−50%', '±10%', '+100%']} />
          <LegendNote>{t(lang, 'explore.legendNew')}</LegendNote>
        </div>
      ) : null}
      {colorBy === 'concentration' ? (
        <div className="gx-legend__list">
          <span>{t(lang, 'explore.legendHHI')}</span>
          <LegendRamp colours={HHI_TOKENS} labels={['0.10', '0.18', '0.25', '0.50']} />
        </div>
      ) : null}
      {colorBy === 'reporting' ? (
        <div className="gx-legend__list">
          <LegendItem colour="node">{t(lang, 'explore.legendReported')}</LegendItem>
          <span className="lr-legend__item"><span className="lr-legend__dot" style={{ background: 'transparent', border: '1.5px solid var(--node)' }} aria-hidden />{t(lang, 'explore.legendNotReported')}</span>
        </div>
      ) : null}
      {colorBy === 'stage' ? (
        <div className="gx-legend__list">
          <span>{t(lang, 'explore.legendStage')}</span>
          <LegendRow>
            {ladder.map((l, i) => <LegendItem key={i} colour={stageToken(i + 1, ladder.length)}>{stageLabel(lang, i + 1)} {l[lang]}</LegendItem>)}
          </LegendRow>
        </div>
      ) : null}

      <div className="gx-legend__sizes">
        {split ? (
          // a reference half-disc for each side: imports left, exports right, nested by value
          <svg width={maxR * 2 + 2} height={maxR * 2 + 4} aria-hidden>
            {keys.sizes.map((k) => (
              <g key={k.value} transform={`translate(${maxR + 1},${maxR * 2 + 2 - k.r})`}>
                <path d={halfDisc(k.r, 'left')} className="gx-legend__half gx-legend__half--m" />
                <path d={halfDisc(k.r, 'right')} className="gx-legend__half gx-legend__half--x" />
              </g>
            ))}
          </svg>
        ) : (
          <svg width={maxR * 2 + 2} height={maxR * 2 + 4} aria-hidden>
            {keys.sizes.map((k) => (
              <circle key={k.value} cx={maxR + 1} cy={maxR * 2 + 2 - k.r} r={k.r} className="gx-legend__circle" />
            ))}
          </svg>
        )}
        <div className="gx-legend__sizetext">
          <span>{split ? t(lang, 'explore.legendSplit') : t(lang, 'explore.legendArea', { measure })}</span>
          {split && isGrouping(colorBy) ? <span className="gx-muted">{t(lang, 'explore.legendRing')}</span> : null}
          {keys.sizes.length ? <span className="gx-muted">{keys.sizes.map((k) => k.text).join(' · ')}</span> : null}
          <span className="gx-muted">{valueMeasure && st.sc === 'fixed' ? t(lang, 'explore.legendFixed') : t(lang, 'explore.legendPeriod')}</span>
        </div>
      </div>
      <div className="gx-legend__widths">
        {keys.widths.map((k) => (
          <span key={k.value} className="lr-legend__item"><span className="gx-legend__w" style={{ height: Math.max(1, k.w) }} aria-hidden />{formatUSD(k.value, lang)}</span>
        ))}
      </div>
      <LegendNote>
        {st.min ? t(lang, 'explore.legendFlows', { k: st.k, min: minLabel(st.min, lang) }) : t(lang, 'explore.legendFlowsNoFloor', { k: st.k })}
        {st.focus ? ` ${t(lang, 'explore.legendFocusFlows', { name: focusName })}` : ''} {t(lang, 'explore.legendArrow')}
      </LegendNote>
      {keys.chokepoints.length ? <LegendNote>{t(lang, 'explore.legendChoke')}</LegendNote> : null}
      {snap ? null : null}
    </Legend>
  );
}
