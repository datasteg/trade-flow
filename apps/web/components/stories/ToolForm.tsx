'use client';
// The selects of the "Cut a supplier" tool, bound to the query: a plain GET form (works without scripts; the Run
// button submits it) that also navigates on change when scripts run.
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { t, type Lang } from '@/lib/i18n';

export interface ToolStageGroup { chain: string; label: string; stages: { value: string; label: string }[] }
export interface ToolExporter { iso: string; label: string }

export function ToolForm({ lang, action, stage, groups, exporter, exporters }: {
  lang: Lang;
  action: string;
  stage: string;
  groups: ToolStageGroup[];
  exporter: string;
  exporters: ToolExporter[];
}) {
  const router = useRouter();
  const form = useRef<HTMLFormElement>(null);
  const go = () => {
    const f = form.current;
    if (!f) return;
    const q = new URLSearchParams(new FormData(f) as unknown as Record<string, string>);
    router.push(`${action}?${q.toString()}`, { scroll: false });
  };
  return (
    <form ref={form} method="get" action={action} className="st-tool__form">
      <label className="lr-field">
        <span className="lr-label">{t(lang, 'cases.tool.stage')}</span>
        <select name="stage" className="st-select" defaultValue={stage} onChange={go}>
          {groups.map((g) => (
            <optgroup key={g.chain} label={g.label}>
              {g.stages.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="lr-field">
        <span className="lr-label">{t(lang, 'cases.tool.exporter')}</span>
        <select name="exporter" className="st-select" defaultValue={exporter} onChange={go}>
          {exporters.map((e) => <option key={e.iso} value={e.iso}>{e.label}</option>)}
        </select>
      </label>
      <button type="submit" className="lr-btn lr-btn--secondary st-tool__run">{t(lang, 'cases.tool.run')}</button>
    </form>
  );
}
