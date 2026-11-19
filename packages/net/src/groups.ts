// Predefined groupings for colouring the maps (data/groups/memberships.json, from config/groups.yaml and
// config/memberships.csv): regions (fixed), trade blocs and clubs (dated memberships), and a reader's own list.
// Membership is read on the last day of the period shown (a year's 31 December, a month's last day), or today.
import { loadData } from './load';
import type { Freq, Snap } from './types';

export type GroupKind = 'region' | 'bloc' | 'club';
/** The colour schemes built on groupings. */
export type Scheme = 'region' | 'bloc' | 'club' | 'custom';

export interface GroupDef {
  kind: GroupKind;
  en: string;
  ko: string;
  /** Colour token (viz-1 … viz-8), fixed for the group on every page and in every year. */
  colour: string;
  note: { en: string; ko: string } | null;
  /** [ISO3, first day, last day] (YYYY-MM-DD, both inclusive; null: open). A member that left and came back has
   *  two rows. Regions have no dates. */
  members: [string, string | null, string | null][];
  /** The sources of the dates. */
  sources: string[];
}

export interface GroupsFile {
  v: number;
  /** Group keys of each scheme, in the order the controls list them. */
  schemes: Record<GroupKind, string[]>;
  custom: { en: string; ko: string; colour: string };
  groups: Record<string, GroupDef>;
}

/** Key of the reader's own list. */
export const CUSTOM = 'custom';

/** groups/memberships.json, loaded once. */
export function loadGroups(): Promise<GroupsFile | null> {
  return loadData<GroupsFile>('groups/memberships.json');
}

/** The last day of a period, YYYY-MM-DD: 31 December of a year, the last day of a month (YYYYMM). */
export function periodEnd(t: number, f: Freq): string {
  if (f === 'A') return `${t}-12-31`;
  const y = Math.floor(t / 100), m = t % 100;
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}`;
}

/** Today as YYYY-MM-DD (UTC). */
export function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Whether an economy belongs to a group on a date (YYYY-MM-DD). */
export function memberOn(g: GroupDef, iso: string, date: string): boolean {
  return g.members.some(([id, a, b]) => id === iso && (a == null || a <= date) && (b == null || date <= b));
}

/** The group's members on a date. */
export function membersOn(g: GroupDef, date: string): string[] {
  const out = new Set<string>();
  for (const [id, a, b] of g.members) if ((a == null || a <= date) && (b == null || date <= b)) out.add(id);
  return [...out];
}

/** What a grouping colours: each economy's group (ISO3 → group key), each group's colour token, the groups in
 *  legend order, how many economies belong to more than one selected group (blocs: the first selected wins), and
 *  the date membership was read on (null for regions and lists, which have no dates). */
export interface GroupColouring {
  scheme: Scheme;
  groupOf: Record<string, string>;
  colours: Record<string, string>;
  keys: string[];
  overlaps: number;
  date: string | null;
}

export interface ColouringOptions {
  /** Blocs in the reader's order (scheme bloc). */
  blocs?: string[];
  /** The club highlighted (scheme club). */
  club?: string;
  /** ISO3 codes (scheme custom). */
  custom?: string[];
  /** Membership on this date (YYYY-MM-DD). */
  date: string;
}

/** Resolves a scheme to colours for one date. Unknown keys are skipped. */
export function resolveColouring(file: GroupsFile, scheme: Scheme, o: ColouringOptions): GroupColouring {
  const groupOf: Record<string, string> = {};
  const colours: Record<string, string> = {};
  const keys: string[] = [];
  let overlaps = 0;
  if (scheme === 'custom') {
    colours[CUSTOM] = file.custom.colour;
    keys.push(CUSTOM);
    for (const iso of o.custom ?? []) groupOf[iso.toUpperCase()] = CUSTOM;
    return { scheme, groupOf, colours, keys, overlaps, date: null };
  }
  const wanted = scheme === 'region' ? file.schemes.region
    : scheme === 'club' ? [o.club ?? file.schemes.club[0]]
      : (o.blocs ?? []);
  const seen = new Map<string, number>();
  for (const k of wanted) {
    const g = file.groups[k];
    if (!g || keys.includes(k)) continue;
    keys.push(k);
    colours[k] = g.colour;
    for (const iso of membersOn(g, o.date)) {
      seen.set(iso, (seen.get(iso) ?? 0) + 1);
      if (!(iso in groupOf)) groupOf[iso] = k;
    }
  }
  for (const n of seen.values()) if (n > 1) overlaps++;
  return { scheme, groupOf, colours, keys, overlaps, date: scheme === 'region' ? null : o.date };
}

/** Per group of a colouring, in one snapshot: the member economies that trade the product, and their share of
 *  world trade ((exports + imports) / 2, as the network's node shares). */
export function groupStats(snap: Snap, c: GroupColouring, meta: { nodes: { id: string }[] }): Record<string, { n: number; share: number }> {
  const out: Record<string, { n: number; share: number }> = {};
  for (const k of c.keys) out[k] = { n: 0, share: 0 };
  for (const n of snap.nodes) {
    if (!(n.total > 0)) continue;
    const k = c.groupOf[meta.nodes[n.i]?.id ?? ''];
    if (!k || !out[k]) continue;
    out[k].n++;
    out[k].share += n.share;
  }
  return out;
}

/** The group's name in the page language. */
export function groupName(file: GroupsFile, key: string, lang: 'en' | 'ko'): string {
  if (key === CUSTOM) return file.custom[lang];
  const g = file.groups[key];
  return g ? g[lang] : key;
}
