'use client';
import { useMemo, useState, type ReactNode } from 'react';
import { Marker } from './marker';
import { cx } from './util';

export interface DataColumn {
  key: string;
  /** With the unit: "Exports 2024, $bn" (units go in the header, not in the cells). */
  label: ReactNode;
  /** Right-aligned, tabular figures. */
  num?: boolean;
  sortable?: boolean;
  /** The column that carries the trail marker on the focus economy's row (default: the first text column). */
  marker?: boolean;
}

export interface DataRow {
  id: string;
  /** What each cell shows (formatted text, an ISO3 span, an HSCode chip …), by column key. */
  cells: Record<string, ReactNode>;
  /** Raw values to sort by, by column key; a cell that is a plain string or number sorts by itself. */
  sort?: Record<string, number | string | null | undefined>;
  /** The focus economy's row: a trail marker and weight 600, never a colour fill. */
  focus?: boolean;
  /** A row set apart from the rows above by a rule (the focus economy below a top five). */
  sep?: boolean;
}

type Dir = 'ascending' | 'descending';

/** The table behind every map and chart: numbers right-aligned, 1px row rules, sortable headers as buttons with
 *  aria-sort. Rows and cells come from a server component; only the sorting runs in the browser. */
export function DataTable({ columns, rows, caption, defaultSort, className }: {
  columns: DataColumn[];
  rows: DataRow[];
  caption?: ReactNode;
  defaultSort?: { key: string; dir: Dir };
  className?: string;
}) {
  const [sort, setSort] = useState(defaultSort);
  const markerKey = (columns.find((c) => c.marker) ?? columns.find((c) => !c.num))?.key;
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const value = (r: DataRow) => {
      const v = r.sort?.[sort.key] ?? r.cells[sort.key];
      return typeof v === 'number' || typeof v === 'string' ? v : null;
    };
    const k = sort.dir === 'ascending' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = value(a), y = value(b);
      if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1; // blanks last either way
      if (typeof x === 'number' && typeof y === 'number') return (x - y) * k;
      return String(x).localeCompare(String(y)) * k;
    });
  }, [rows, sort]);

  function toggle(c: DataColumn) {
    setSort((s) => s?.key === c.key
      ? { key: c.key, dir: s.dir === 'ascending' ? 'descending' : 'ascending' }
      : { key: c.key, dir: c.num ? 'descending' : 'ascending' });
  }

  return (
    <div className={cx('lr-tablewrap', className)}>
      <table className="lr-table">
        {caption ? <caption>{caption}</caption> : null}
        <thead>
          <tr>
            {columns.map((c) => (
              <th key={c.key} scope="col" className={c.num ? 'num' : undefined}
                aria-sort={c.sortable ? (sort?.key === c.key ? sort.dir : 'none') : undefined}>
                {c.sortable ? <button type="button" onClick={() => toggle(c)}>{c.label}</button> : c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((r) => (
            <tr key={r.id} className={cx(r.focus && 'is-focus', r.sep && 'is-sep') || undefined}>
              {columns.map((c) => (
                <td key={c.key} className={c.num ? 'num' : undefined}>
                  {r.focus && c.key === markerKey ? <><Marker size="sm" />{' '}</> : null}
                  {r.cells[c.key]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
