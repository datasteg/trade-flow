// One chart on an event or case page, the way the chart kit wants it: a title, the one-line reading
// written from the numbers, the chart, notes, the source line, and under it the table view and the CSV of exactly
// what the chart shows.
import type { ReactNode } from 'react';
import type { DataColumn, DataRow } from '@larch/ui';
import type { Lang } from '@/lib/i18n';
import { FigureTools } from './FigureTools';
import { cap } from './names';

export interface FigureTable {
  columns: DataColumn[];
  rows: DataRow[];
  /** The CSV: a header row in the page language, then unformatted numbers. */
  csv: (string | number | null)[][];
  filename: string;
}

export function Figure({ lang, title, reading, children, notes, source, table, id, wide }: {
  lang: Lang;
  title: ReactNode;
  reading?: ReactNode;
  children?: ReactNode;
  notes?: ReactNode[];
  source: ReactNode;
  table?: FigureTable;
  id?: string;
  wide?: boolean;
}) {
  return (
    <figure className={`st-fig${wide ? ' st-fig--wide' : ''}`} id={id}>
      <h3 className="st-fig__title">{title}</h3>
      {reading ? <p className="st-fig__reading">{typeof reading === 'string' ? cap(reading) : reading}</p> : null}
      {children}
      <figcaption className="st-fig__caption">
        {(notes ?? []).filter(Boolean).map((n, i) => <span key={i} className="st-fig__note">{n}</span>)}
        <span className="lr-caption">{source}</span>
      </figcaption>
      {table ? <FigureTools lang={lang} {...table} source={typeof source === 'string' ? source : null} /> : null}
    </figure>
  );
}
