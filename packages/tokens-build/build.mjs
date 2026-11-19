// design/tokens.json -> design/tokens.css (the Larch design system's tokens). A port of scripts/tokens_css.py:
// the output is the same byte for byte, so `pnpm tokens` before every build leaves a committed tokens.css unchanged.
//
//   node packages/tokens-build/build.mjs      (or: pnpm tokens, from trade-flow/)
//
// Light values go on :root; dark values under prefers-color-scheme (unless data-theme="light") and again under
// [data-theme="dark"], so the theme toggle wins both ways. Colour aliases ("{name}") resolve per theme to the
// literal value. tokens.json comes from the Larch design book.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DESIGN = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'design');
const OTHER = ['spacing', 'radius', 'layout', 'network', 'zIndex', 'opacity'];

const t = JSON.parse(readFileSync(join(DESIGN, 'tokens.json'), 'utf8'));
const first = t.color.themes[0].id;
// Same as the Python dict: one entry per name, in first-seen order, the last value winning.
const colours = new Map();
for (const c of t.color.tokens) colours.set(c.name, c.value);

const perTheme = (v, theme) => (typeof v === 'string' ? v : (v[theme] ?? v[first]));

function value(name, theme, seen = new Set()) {
  if (!colours.has(name)) throw new Error(`tokens.json: alias of missing colour ${name}`);
  if (seen.has(name)) throw new Error(`tokens.json: alias loop at ${name}`);
  seen.add(name);
  const v = perTheme(colours.get(name), theme);
  return v.startsWith('{') ? value(v.slice(1, -1), theme, seen) : v;
}

function block(theme, indent) {
  const lines = [...colours.keys()].map((n) => `${indent}--${n}: ${value(n, theme)};`);
  for (const s of t.shadow?.tokens ?? []) lines.push(`${indent}--${s.name}: ${perTheme(s.value, theme)};`);
  return lines.join('\n');
}

const other = OTHER.flatMap((k) => (t[k]?.tokens ?? []).map((x) => `  --${x.name}: ${x.value};`));
const fonts = Object.entries(t.type.families).map(([k, v]) => `  --font-${k}: ${v};`);

const css = `/* ${t.name} — generated from tokens.json */
:root {
  color-scheme: light;
${block('light', '  ')}
${other.join('\n')}
${fonts.join('\n')}
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    color-scheme: dark;
${block('dark', '    ')}
  }
}
:root[data-theme="dark"] {
  color-scheme: dark;
${block('dark', '  ')}
}
`;

writeFileSync(join(DESIGN, 'tokens.css'), css);
console.log(`wrote design/tokens.css: ${colours.size} colours, ${other.length} other tokens`);
