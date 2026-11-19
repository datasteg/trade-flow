'use client';
import { useState, type ReactNode } from 'react';
import { Download, Table2, ChartLine } from 'lucide-react';
import { Button } from '@larch/ui';
import { t, type Lang } from '@/lib/i18n';
import { downloadText } from './hooks';
import { csvText } from './model';

export interface CsvSpec { name: string; header: string[]; rows: (string | number | null)[][] }

/** A chart with its title, a "Show as table" switch, a CSV of what it shows, and its caption and source line.
 *  The table replaces the chart while it is on. */
export function ChartFrame({ lang, title, caption, csv, table, children, className, wide }: {
  lang: Lang;
  title?: ReactNode;
  caption: ReactNode;
  csv?: CsvSpec;
  /** The table view; without one there is no switch (the body is a table already). */
  table?: ReactNode;
  children: ReactNode;
  className?: string;
  /** The controls sit under the title rather than beside it. */
  wide?: boolean;
}) {
  const [asTable, setAsTable] = useState(false);
  return (
    <figure className={['ch-fig', wide ? 'ch-fig--wide' : '', className ?? ''].filter(Boolean).join(' ')}>
      <div className="ch-fig__bar">
        {title ? <p className="ch-fig__title">{title}</p> : null}
        <div className="ch-fig__tools">
          {table ? (
            <Button size="sm" variant="quiet" aria-pressed={asTable} onClick={() => setAsTable((x) => !x)}
              icon={asTable ? <ChartLine size={16} strokeWidth={1.5} aria-hidden /> : <Table2 size={16} strokeWidth={1.5} aria-hidden />}>
              {t(lang, asTable ? 'chains.chart.chart' : 'chains.chart.table')}
            </Button>
          ) : null}
          {csv ? (
            <Button size="sm" variant="quiet" onClick={() => downloadText(csv.name, csvText(csv.header, csv.rows))}
              icon={<Download size={16} strokeWidth={1.5} aria-hidden />}>
              {t(lang, 'chains.chart.csv')}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="ch-fig__body">{asTable && table ? <div className="ch-fig__table">{table}</div> : children}</div>
      <figcaption className="lr-caption">{caption}</figcaption>
    </figure>
  );
}
