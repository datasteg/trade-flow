'use client';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { HSCode, stageLabel } from '@larch/ui';
import { stageVar, type Meta, type MetaProduct } from '@larch/net/core';
import { t, type Lang } from '@/lib/i18n';

/** A chain as the explorer needs it: its names and its ladder (the rungs' names), from chains/index.json. */
export interface ChainName { id: string; en: string; ko: string; levels: { en: string; ko: string }[] }

interface Option { p: MetaProduct; group: string; sub?: string }

/** The first control in the rail: all goods, the chain stages (grouped by chain, with stage pills and HS codes), the
 *  baskets and the HS chapters. A listbox with type-ahead: typing filters by name (both languages) and HS code;
 *  ↑ ↓ move, Enter selects, Escape closes. Writes `p`. */
export function ProductPicker({ lang, meta, chains, value, onChange }: {
  lang: Lang;
  meta: Meta;
  chains: ChainName[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const wrap = useRef<HTMLDivElement>(null);

  const chainName = (cid: string) => { const c = chains.find((x) => x.id === cid); return c ? c[lang] : cid; };
  /** The length of a product's chain's ladder, for the rung's colour. */
  const rungsOf = (p: MetaProduct) => chains.find((x) => x.id === p.chain)?.levels.length ?? 5;
  const options = useMemo<Option[]>(() => {
    const out: Option[] = [];
    const ps = meta.products;
    for (const p of ps.filter((x) => x.kind === 'total')) out.push({ p, group: t(lang, 'explore.group.total') });
    const order = chains.map((c) => c.id);
    const stages = ps.filter((x) => x.kind === 'stage').sort((a, b) => order.indexOf(a.chain ?? '') - order.indexOf(b.chain ?? '') || (a.stage ?? 0) - (b.stage ?? 0));
    for (const p of stages) out.push({ p, group: t(lang, 'explore.group.chains'), sub: chainName(p.chain ?? '') });
    for (const p of ps.filter((x) => x.kind === 'basket')) out.push({ p, group: t(lang, 'explore.group.baskets') });
    for (const p of ps.filter((x) => x.kind === 'chapter')) out.push({ p, group: t(lang, 'explore.group.chapters') });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [meta, chains, lang]);

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    const digits = s.replace(/[.\s]/g, '');
    return options.filter(({ p, sub }) => p.en.toLowerCase().includes(s) || p.ko.includes(q.trim()) || (p.label_long ?? '').toLowerCase().includes(s)
      || (sub ?? '').toLowerCase().includes(s) || (/^\d+$/.test(digits) && p.codes.some((c) => c.startsWith(digits) || digits.startsWith(c))));
  }, [q, options]);

  const current = meta.products.find((p) => p.id === value);

  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const i = shown.findIndex((o) => o.p.id === value);
    setActive(i >= 0 ? i : 0);
    const close = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => { setActive(0); }, [q]);
  useEffect(() => {
    const el = list.current?.querySelector<HTMLElement>(`[data-i="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function pick(o: Option | undefined) {
    if (!o) return;
    onChange(o.p.id);
    setOpen(false);
    setQ('');
    trigger.current?.focus();
  }

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(shown.length - 1, a + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[active]); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setOpen(false); trigger.current?.focus(); }
  }

  const name = (p: MetaProduct) => (lang === 'ko' ? p.ko : p.en);
  let lastHead = '';
  return (
    <div className="lr-field gx-picker" ref={wrap}>
      <span className="lr-label" id={`${id}-l`}>{t(lang, 'explore.product')}</span>
      <div className="lr-picker">
        <button ref={trigger} type="button" className="lr-picker__trigger" aria-haspopup="listbox" aria-expanded={open} aria-labelledby={`${id}-l ${id}-v`}
          onClick={() => setOpen(!open)} onKeyDown={(e) => { if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); } }}>
          <span id={`${id}-v`}>{current ? name(current) : value}</span>
          {current?.kind === 'stage' && current.stage ? <StagePill lang={lang} n={current.stage} of={rungsOf(current)} /> : null}
          {current && current.codes.length ? <HSCode lang={lang} code={current.codes[0]} title={current.codes.length > 1 ? current.codes.join(', ') : undefined} /> : null}
          <ChevronDown size={16} strokeWidth={1.5} aria-hidden />
        </button>
        {open ? (
          <div className="lr-picker__menu gx-picker__menu">
            <div className="lr-search gx-picker__search">
              <input ref={input} type="search" value={q} placeholder={t(lang, 'explore.productSearch')} aria-label={t(lang, 'explore.productSearch')}
                role="combobox" aria-expanded aria-controls={`${id}-list`} aria-activedescendant={shown[active] ? `${id}-o${active}` : undefined}
                onChange={(e) => setQ(e.target.value)} onKeyDown={onKey} />
            </div>
            <ul ref={list} id={`${id}-list`} role="listbox" aria-label={t(lang, 'explore.product')} className="gx-picker__list">
              {shown.length === 0 ? <li className="gx-picker__empty">{t(lang, 'explore.noProducts')}</li> : null}
              {shown.map((o, i) => {
                const head = o.sub ? `${o.group} · ${o.sub}` : o.group;
                const showHead = head !== lastHead;
                lastHead = head;
                return (
                  <li key={o.p.id} role="presentation">
                    {showHead ? <p className="lr-picker__group" role="presentation">{o.sub ?? o.group}</p> : null}
                    <div id={`${id}-o${i}`} data-i={i} role="option" aria-selected={o.p.id === value} className={`lr-picker__opt${i === active ? ' is-active' : ''}`}
                      onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)}>
                      {o.p.kind === 'stage' && o.p.stage ? <StagePill lang={lang} n={o.p.stage} of={rungsOf(o.p)} /> : <span className="gx-picker__gap" />}
                      <span>{name(o.p)}</span>
                      {o.p.codes.length ? <HSCode lang={lang} code={o.p.codes[0]} title={o.p.codes.join(', ')} /> : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** "S3" with the rung's colour: rung n of a ladder of `of` rungs. */
export function StagePill({ lang, n, of = 5 }: { lang: Lang; n: number; of?: number }) {
  return <span className="lr-stage-pill"><i style={{ background: stageVar(n, of) }} aria-hidden />{stageLabel(lang, n)}</span>;
}
