import type { Lang } from '@larch/ui/format';

/** One interface string in both editions. `{name}` placeholders are filled by t(lang, key, { name }). */
export type Entry = Record<Lang, string>;

/** One area's strings (one module per area under lib/strings/), keyed without the area prefix. */
export type StringTable = Record<string, Entry>;
