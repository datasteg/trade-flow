'use client';
// What a page has selected, for the family strip's context links (components/Family.tsx): the chain pages' focus
// economy and the explorers' country or flow card. A tiny external store: the page writes it from its own state,
// the strip reads it with useSyncExternalStore. Empty on the server and on pages that select nothing.
import { useSyncExternalStore } from 'react';

export interface PageContext {
  /** The selected economy: ISO3 and its name in the page language. */
  focus?: { iso: string; name: string } | null;
  /** The selected flow, exporter → importer. */
  flow?: { a: string; b: string; aName: string; bName: string } | null;
}

const EMPTY: PageContext = {};
let current: PageContext = EMPTY;
const subscribers = new Set<() => void>();

export function setPageContext(next: PageContext): void {
  current = next.focus || next.flow ? next : EMPTY;
  for (const fn of subscribers) fn();
}

function subscribe(fn: () => void): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

export function usePageContext(): PageContext {
  return useSyncExternalStore(subscribe, () => current, () => EMPTY);
}
