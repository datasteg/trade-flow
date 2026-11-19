import { chains } from './chains';
import { cases } from './cases';
import { common } from './common';
import { events } from './events';
import { explore } from './explore';
import { home } from './home';
import { method } from './method';
import type { StringTable } from './types';

// The string tables, one per area. To add an area: write lib/strings/<area>.ts exporting
// `export const <area> = { key: { en: '…', ko: '…' } } satisfies StringTable;`, then add it here.
// Its keys are then t(lang, '<area>.<key>'), type-checked.
export const TABLES = {
  common,
  cases,
  chains,
  events,
  explore,
  home,
  method,
} satisfies Record<string, StringTable>;

export type { Entry, StringTable } from './types';
