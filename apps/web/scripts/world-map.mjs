// Copies the Natural Earth 1:110m world (world-atlas, TopoJSON, public domain) to public/world-110m.json, where the
// explorer fetches it (/world-110m.json). Runs before `next dev` and `next build`; the copy is gitignored.
import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const src = createRequire(import.meta.url).resolve('world-atlas/countries-110m.json');
const out = join(here, '..', 'public', 'world-110m.json');
mkdirSync(dirname(out), { recursive: true });
copyFileSync(src, out);
console.log('public/world-110m.json <- world-atlas/countries-110m.json');
