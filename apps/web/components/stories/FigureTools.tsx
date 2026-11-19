'use client';
import { useId, useState } from 'react';
import { Table2 } from 'lucide-react';
import { DataTable, type DataColumn, type DataRow } from '@larch/ui';
import { t, type Lang } from '@/lib/i18n';
import { CsvButton } from './CsvButton';

/** The row under a chart: "Show as table" (the same numbers as the chart) and "Download CSV". The table is in the
 *  page from the start, hidden until asked for. */
export function FigureTools({ lang, columns, rows, csv, filename, source }: {
  lang: Lang;
  columns: DataColumn[];
  rows: DataRow[];
  csv: (string | number | null)[][];
  filename: string;
  /** The figure's source line (with any supplement's citation): the CSV's last line, after a blank one. */
  source?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className="st-fig__tools">
      <div className="st-fig__buttons">
        <button type="button" className="lr-btn lr-btn--secondary lr-btn--sm" aria-expanded={open} aria-controls={id}
          onClick={() => setOpen((o) => !o)}>
          <Table2 aria-hidden strokeWidth={1.5} />
          {t(lang, open ? 'cases.fig.hideTable' : 'cases.fig.table')}
        </button>
        <CsvButton rows={source ? [...csv, [], [source]] : csv} filename={filename} label={t(lang, 'cases.fig.csv')} />
      </div>
      <div id={id} className="st-fig__table" hidden={!open}>
        <DataTable columns={columns} rows={rows} />
      </div>
    </div>
  );
}
