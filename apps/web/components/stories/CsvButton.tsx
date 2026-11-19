'use client';
import { Download } from 'lucide-react';

/** A cell as CSV text: quoted when it holds a comma, quote or line break. */
function cell(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Downloads what a chart shows as CSV (UTF-8 with a BOM, so spreadsheet programs read Korean headers; numbers
 *  unformatted: shares and changes as fractions). The file is made in the browser when the reader asks for it. */
export function CsvButton({ rows, filename, label }: { rows: (string | number | null)[][]; filename: string; label: string }) {
  function download() {
    const text = '﻿' + rows.map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n';
    const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <button type="button" className="lr-btn lr-btn--secondary lr-btn--sm" onClick={download}>
      <Download aria-hidden strokeWidth={1.5} />
      {label}
    </button>
  );
}
