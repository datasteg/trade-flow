// Shared furniture of the chart kit: one axis, horizontal 1px gridlines in
// viz-grid, ticks in ink-muted, the partial band in viz-band labelled at its top left, the base as a hollow marker,
// events as diamonds, the last value labelled. Every chart also gives its table (what it shows, nothing more) and
// a CSV of it (UTF-8 with BOM, headers in the page language, numbers unformatted).
import { select, type Selection } from 'd3';
import { formatPeriod, formatShare, type Lang } from '@larch/ui/format';
import { s } from '../strings';

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SvgSel = Selection<SVGSVGElement, unknown, any, any>;
export type GSel = Selection<SVGGElement, unknown, any, any>;

export interface Margin { t: number; r: number; b: number; l: number }

/** A chart's table: columns with labels in the page language, rows of display text and raw values. */
export interface ChartTable {
  columns: { key: string; label: string; num?: boolean }[];
  rows: { id: string; cells: Record<string, string>; raw: Record<string, string | number | null>; focus?: boolean }[];
}

/** The CSV of a table: UTF-8 with BOM, the header row in the page language, raw (unformatted) numbers. */
export function tableCSV(t: ChartTable, source?: string | null): string {
  const esc = (x: string | number | null | undefined) => {
    if (x == null) return '';
    const str = String(x);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = [t.columns.map((c) => esc(c.label)).join(',')];
  for (const r of t.rows) lines.push(t.columns.map((c) => esc(r.raw[c.key] ?? null)).join(','));
  // the chart's source line (with any supplement's citation) travels with the numbers, after a blank line
  if (source) lines.push('', esc(source));
  return `﻿${lines.join('\r\n')}\r\n`;
}

/** Saves a CSV in the browser. */
export function downloadCSV(name: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name.endsWith('.csv') ? name : `${name}.csv`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Whether periods are months (YYYYMM). */
export const isMonthly = (periods: number[]): boolean => (periods[0] ?? 0) > 9999;

/** Tick periods: years every 1, 2, 5 or 10; months at January of every 1, 2 or 5 years. Always the first and last. */
export function periodTicks(periods: number[], width: number, minGap = 64): number[] {
  if (!periods.length) return [];
  const monthly = isMonthly(periods);
  const years = monthly ? Math.max(1, (periods[periods.length - 1] - periods[0]) / 100) : periods.length;
  const fit = Math.max(1, Math.floor(width / minGap));
  const step = [1, 2, 5, 10, 20].find((k) => years / k <= fit) ?? 25;
  const out = periods.filter((p) => {
    const y = monthly ? Math.floor(p / 100) : p;
    if (monthly && p % 100 !== 1) return false;
    return y % step === 0;
  });
  return out;
}

/** A period tick: "2024"; months show their year at January ("2024"), or "Mar 2026" when asked. */
export function tickLabel(p: number, lang: Lang, full = false): string {
  if (p > 9999 && !full) return lang === 'ko' ? `${Math.floor(p / 100)}년` : String(Math.floor(p / 100));
  return formatPeriod(p, lang);
}

/** The partial band: periods after the last complete one, shaded and labelled "partial" (with the share filed). */
export function drawPartialBand(g: GSel, x0: number, x1: number, y0: number, y1: number, label: string, labelInside = true): void {
  g.append('rect').attr('class', 'lr-strip__band').attr('x', x0).attr('y', y0).attr('width', Math.max(0, x1 - x0)).attr('height', Math.max(0, y1 - y0));
  if (!labelInside) return;
  // inside the band at its top left; a band narrower than its label gets the label to its left, ending at the band
  const wide = x1 - x0 > label.length * 6 + 8;
  g.append('text').attr('class', 'lr-strip__label ln-band-label').attr('x', wide ? x0 + 4 : x0 - 4).attr('y', y0 + 11)
    .attr('text-anchor', wide ? 'start' : 'end').text(label);
}

/** "partial" or "partial · 62% filed". */
export function partialLabel(lang: Lang, coverage: number | null | undefined): string {
  return coverage != null ? s(lang, 'partialFiled', { v: formatShare(coverage, lang) }) : s(lang, 'partial');
}

/** An event diamond on the axis (at most three annotations per chart: callers pass the ones that matter). */
export function drawDiamond(g: GSel, x: number, y: number, size = 5, cls = 'ln-event') {
  return g.append('rect').attr('class', cls).attr('x', -size / 2).attr('y', -size / 2).attr('width', size).attr('height', size)
    .attr('transform', `translate(${x},${y}) rotate(45)`);
}

/** Observes the host's width; calls draw(width) on change. Returns the stop function. */
export function watchWidth(host: HTMLElement, draw: (w: number) => void): () => void {
  let last = -1;
  const ro = new ResizeObserver(() => {
    const w = Math.round(host.clientWidth);
    if (w && w !== last) { last = w; draw(w); }
  });
  ro.observe(host);
  const w0 = Math.round(host.clientWidth);
  if (w0) { last = w0; draw(w0); }
  return () => ro.disconnect();
}

/** A fresh SVG in the host. */
export function freshSvg(host: HTMLElement, w: number, h: number, label: string): SvgSel {
  select(host).selectAll('svg.ln-chart__svg').remove();
  return select(host).append('svg').attr('class', 'ln-chart__svg').attr('viewBox', `0 0 ${w} ${h}`)
    .attr('width', w).attr('height', h).attr('role', 'img').attr('aria-label', label) as SvgSel;
}

/** End labels pushed apart so they never overlap (one line, 14px), keeping their order. */
export function spreadLabels<T extends { y: number }>(items: T[], gap = 14, lo = -Infinity, hi = Infinity): T[] {
  const sorted = [...items].sort((a, b) => a.y - b.y);
  for (let i = 1; i < sorted.length; i++) sorted[i].y = Math.max(sorted[i].y, sorted[i - 1].y + gap);
  const over = (sorted[sorted.length - 1]?.y ?? 0) - hi;
  if (over > 0) for (const it of sorted) it.y -= over;
  for (let i = 0; i < sorted.length; i++) sorted[i].y = Math.max(sorted[i].y, lo + i * gap);
  return sorted;
}

/** A compact axis value: "$1.2tn" style numbers are left to the caller's format; this only trims trailing zeros. */
export function trimZeros(x: string): string {
  return x.replace(/\.0(?=\D|$)/, '');
}
