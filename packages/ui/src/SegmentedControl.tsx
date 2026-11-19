'use client';
import { useId, useState, type ReactNode } from 'react';

export interface Segment<V extends string> { value: V; label: ReactNode }

/** Two to five views of the same thing (Map | Force, Value | Weight, the colour mode): buttons with aria-pressed on
 *  a track, under a visible label. Controlled (`value` + `onChange`) or uncontrolled (`defaultValue`). */
export function SegmentedControl<V extends string>({ label, options, value, defaultValue, onChange, id }: {
  label: ReactNode;
  options: Segment<V>[];
  value?: V;
  defaultValue?: V;
  onChange?: (value: V) => void;
  id?: string;
}) {
  const auto = useId();
  const labelId = `${id ?? auto}-label`;
  const [inner, setInner] = useState<V | undefined>(defaultValue ?? options[0]?.value);
  const current = value ?? inner;
  return (
    <div className="lr-field">
      <span className="lr-label" id={labelId}>{label}</span>
      <div className="lr-seg" role="group" aria-labelledby={labelId}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === current}
            onClick={() => { if (value === undefined) setInner(o.value); onChange?.(o.value); }}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
