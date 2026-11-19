'use client';
import { useId, useState, type ReactNode, type Ref } from 'react';
import { CircleCheck, CircleMinus, CircleX, Eye, Info } from 'lucide-react';
import { DataTable } from '@larch/ui';
import type { Lang } from '@larch/ui/format';
import { downloadCSV, tableCSV, type ChartTable } from '../charts/common';
import { s } from '../strings';
import type { CheckStatus } from '../types';
import '../net.css';

/** A status as a word with an icon, never a colour alone: Pass, Watch, Fail, Context, Not run. */
export function StatusWord({ lang, status }: { lang: Lang; status: CheckStatus }) {
  const Icon = status === 'pass' ? CircleCheck : status === 'watch' ? Eye : status === 'fail' ? CircleX : status === 'info' ? Info : CircleMinus;
  const key = `status_${status}` as const;
  return (
    <span className={`ln-status ln-status--${status.replace(' ', '-')}`}>
      <Icon size={16} strokeWidth={1.5} aria-hidden />
      {s(lang, key as Parameters<typeof s>[1])}
    </span>
  );
}

/** The frame every chart sits in: optional title and status, the plot, the source line, and "Show as table" with
 *  the table and its CSV (UTF-8 with BOM, what the chart shows and nothing more). */
export function ChartFrame({ lang, title, status, source, table, csvName, plotRef, height, children, className }: {
  lang: Lang;
  title?: ReactNode;
  status?: CheckStatus;
  /** The source line: "Source: UN Comtrade, Final data, HS6; mirror rule." (period, rule, HS version, lens). */
  source?: ReactNode;
  table?: ChartTable;
  /** File name of the CSV, without .csv. */
  csvName?: string;
  plotRef: Ref<HTMLDivElement>;
  height?: number;
  children?: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <figure className={['ln-chart', className].filter(Boolean).join(' ')}>
      {title || status ? (
        <div className="ln-chart__head">
          {title ? <figcaption className="ln-chart__title">{title}</figcaption> : null}
          {status ? <StatusWord lang={lang} status={status} /> : null}
        </div>
      ) : null}
      <div className="ln-chart__plot" ref={plotRef} style={height ? { minHeight: height } : undefined} />
      {children}
      {source ? <p className="lr-caption ln-chart__source">{source}</p> : null}
      {table ? (
        <div className="ln-chart__tools">
          <button type="button" className="lr-btn lr-btn--quiet lr-btn--sm" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
            {s(lang, open ? 'hideTable' : 'showTable')}
          </button>
          <button type="button" className="lr-btn lr-btn--quiet lr-btn--sm" onClick={() => downloadCSV(csvName ?? 'chart', tableCSV(table, typeof source === 'string' ? source : null))}>
            {s(lang, 'csv')}
          </button>
        </div>
      ) : null}
      {table && open ? (
        <div id={id}>
          <DataTable
            columns={table.columns.map((c) => ({ key: c.key, label: c.label, num: c.num, sortable: true }))}
            rows={table.rows.map((r) => ({ id: r.id, cells: r.cells, sort: r.raw, focus: r.focus }))}
          />
        </div>
      ) : null}
    </figure>
  );
}
