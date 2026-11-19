// The generated data folder: trade-flow/data/**/<name>.json.br (brotli, written by the Python builder), with
// <name>.json.gz (gzip) as the fallback when no .br file exists. Pages ask for /data/<path>.json (app/data/[...path]);
// server components and generateStaticParams read the same files with readData().
//
// DATA_DIR (env) points at the folder. Default: <cwd>/../../data. Every way the app runs has its cwd in apps/web:
// `pnpm dev` and `pnpm start` run there, and the standalone server.js chdirs to its own folder (/app/apps/web in the
// container, whose Dockerfile also sets DATA_DIR=/app/data). So the default is trade-flow/data, or /app/data.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliDecompress, constants, gunzip } from 'node:zlib';

const unbrotli = promisify(brotliDecompress);
const ungzip = promisify(gunzip);

export const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(/* turbopackIgnore: true */ process.cwd(), '..', '..', 'data'));

/** What a data path may look like: letters, digits, _ . : - and /, ending in .json ("chains/batteries.json",
 *  "net/HS:850760/2024.json"). */
const SAFE = /^[A-Za-z0-9_.:\-/]+\.json$/;

/** The absolute file path (without .br / .gz) of a requested data path, or null when the path is not allowed:
 *  anything outside the pattern, absolute paths, empty, "." or ".." segments, or a path that leaves DATA_DIR. */
export function resolveDataPath(rel: string): string | null {
  if (!SAFE.test(rel) || rel.startsWith('/')) return null;
  if (rel.split('/').some((s) => s === '' || s === '.' || s === '..')) return null;
  const full = path.resolve(DATA_DIR, rel);
  return full.startsWith(DATA_DIR + path.sep) ? full : null;
}

export type DataEncoding = 'br' | 'gzip';

export interface DataFile {
  /** The compressed bytes as stored. */
  body: Buffer;
  encoding: DataEncoding;
  /** A brotli stream in the non-standard large-window format (lgwin > 24, first byte 0x11 or 0x91), which browsers
   *  cannot decode: send it decoded, never as content-encoding: br. */
  largeWindow?: boolean;
}

function missing(e: unknown): boolean {
  const code = (e as NodeJS.ErrnoException)?.code;
  return code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR';
}

async function readIf(file: string): Promise<Buffer | null> {
  try {
    return await readFile(file);
  } catch (e) {
    if (missing(e)) return null;
    throw e;
  }
}

/** The stored file for a data path: <path>.br first, then <path>.gz; null when neither exists or the path is not
 *  allowed (check resolveDataPath first to tell the two apart). */
export async function readDataFile(rel: string): Promise<DataFile | null> {
  const base = resolveDataPath(rel);
  if (!base) return null;
  const br = await readIf(`${base}.br`);
  if (br) return { body: br, encoding: 'br', largeWindow: br.length > 0 && (br[0] & 0x7f) === 0x11 };
  const gz = await readIf(`${base}.gz`);
  return gz ? { body: gz, encoding: 'gzip' } : null;
}

/** The plain JSON bytes of a stored file. */
export async function decodeDataFile(f: DataFile): Promise<Buffer> {
  if (f.encoding === 'gzip') return ungzip(f.body);
  return unbrotli(f.body, f.largeWindow ? { params: { [constants.BROTLI_DECODER_PARAM_LARGE_WINDOW]: 1 } } : {});
}

// Parsed files, kept per process: the data are baked into the image, so a file never changes while the server runs.
// Bounded, because the server has 256 MB; not kept in `next dev`, where the builder may rewrite files.
const MEMO_MAX = 64;
const memo = new Map<string, Promise<unknown>>();

/** Reads and parses /data/<rel> on the server (rel as requested, e.g. "chains/index.json"). For server components
 *  and generateStaticParams; the browser fetches /data/<rel> instead. Rejects when the file is missing. */
export function readData<T>(rel: string): Promise<T> {
  const hit = memo.get(rel);
  if (hit) {
    memo.delete(rel);
    memo.set(rel, hit); // most recently used last
    return hit as Promise<T>;
  }
  const load = (async () => {
    if (!resolveDataPath(rel)) throw new Error(`readData: not a data path: ${rel}`);
    const f = await readDataFile(rel);
    if (!f) throw new Error(`readData: no ${rel}.br or ${rel}.gz in ${DATA_DIR}`);
    return JSON.parse((await decodeDataFile(f)).toString('utf8')) as T;
  })();
  if (process.env.NODE_ENV !== 'development') {
    memo.set(rel, load);
    load.catch(() => memo.delete(rel));
    while (memo.size > MEMO_MAX) memo.delete(memo.keys().next().value as string);
  }
  return load;
}
