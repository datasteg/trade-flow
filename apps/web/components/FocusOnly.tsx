'use client';
// The reader's focus economy, ?focus=ISO3 in the address (none by default: no page assumes a reader from any one
// economy). useFocus reads it after hydration; FocusOnly shows its children only while the focus is one economy, for
// content measured for that economy alone (the case studies' Korea sections, written before the focus existed).
import { useEffect, useState, type ReactNode } from 'react';

/** ?focus=ISO3, upper-cased, or null; null on the server and in the first client render. */
export function useFocus(): string | null {
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    const read = () => {
      const v = new URLSearchParams(window.location.search).get('focus')?.toUpperCase() ?? '';
      setFocus(/^[A-Z]{3}$/.test(v) ? v : null);
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, []);
  return focus;
}

export function FocusOnly({ iso, children }: { iso: string; children: ReactNode }) {
  return useFocus() === iso ? <>{children}</> : null;
}
