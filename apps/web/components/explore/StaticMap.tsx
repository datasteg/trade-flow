import type { StaticMap as StaticMapData } from '@larch/net/core';

const MARKERS = ['edge', 'viz-1', 'viz-2', 'viz-3', 'viz-4', 'viz-5', 'viz-6', 'viz-7', 'viz-8'];
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** "M10,20Q30,40 50,60" → "M10,20q20,20 40,40". */
function relQuad(d: string): string {
  const m = d.match(/^M(-?\d+),(-?\d+)Q(-?\d+),(-?\d+) (-?\d+),(-?\d+)$/);
  if (!m) return d;
  const [x, y, cx, cy, ex, ey] = m.slice(1).map(Number);
  return `M${x},${y}q${cx - x},${cy - y} ${ex - x},${ey - y}`;
}

/** The SVG markup of the first view, as one string (it travels in the HTML and once more in the page payload, so it
 *  is kept compact: whole pixels, relative paths, colours set once per group, the 200 largest flows). Token colours
 *  only. The ground is the regions' tints and names (no land: the map layout moves economies off it). */
export function staticSvg(data: StaticMapData, label: string): string {
  const out: string[] = [];
  out.push(`<svg class="gx-static__svg" viewBox="0 0 ${data.width} ${data.height}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${esc(label)}"><defs>`);
  for (const tk of MARKERS) {
    out.push(`<marker id="gxs-${tk}" viewBox="0 -5 10 10" refX="8" refY="0" markerWidth="6" markerHeight="6" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,-4L10,0L0,4Z" style="fill:var(--${tk})"/></marker>`);
  }
  out.push('</defs>');
  for (const r of data.regions) {
    out.push(`<g class="gxs-r" style="fill:var(--${r.colour})">`);
    for (const [x, y, rad] of r.discs) out.push(`<circle cx="${Math.round(x)}" cy="${Math.round(y)}" r="${Math.round(rad)}"/>`);
    out.push('</g>');
  }
  for (const n of data.names) {
    out.push(`<text class="lr-mapregion gxs-rn" x="${Math.round(n.x)}" y="${Math.round(n.y)}" dy="0.35em" text-anchor="${n.anchor}">${esc(n.text)}</text>`);
  }
  const byStroke = new Map<string, typeof data.edges>();
  for (const e of data.edges) byStroke.set(e.stroke, [...(byStroke.get(e.stroke) ?? []), e]);
  for (const [stroke, edges] of byStroke) {
    const m = MARKERS.includes(stroke) ? ` marker-end="url(#gxs-${stroke})"` : '';
    out.push(`<g class="gxs-f" style="stroke:var(--${stroke})"${m}>`);
    for (const e of edges) out.push(`<path d="${relQuad(e.d)}" stroke-width="${e.width}"/>`);
    out.push('</g>');
  }
  const byFill = new Map<string, typeof data.nodes>();
  for (const n of data.nodes) byFill.set(n.fill ?? '', [...(byFill.get(n.fill ?? '') ?? []), n]);
  for (const [fill, nodes] of byFill) {
    out.push(`<g class="gxs-n" style="${fill ? `fill:var(--${fill})` : 'fill:none;stroke:var(--node)'}">`);
    for (const n of nodes) out.push(`<circle cx="${n.x}" cy="${n.y}" r="${n.r}"/>`);
    out.push('</g>');
  }
  for (const n of data.nodes) if (n.choke) out.push(`<circle class="lr-node__choke" cx="${n.x}" cy="${n.y}" r="${n.r + 3}"/>`);
  out.push('<g aria-hidden="true">');
  for (const l of data.labels) {
    out.push(`<text class="lr-maplabel${l.strong ? ' lr-maplabel--strong' : ''}" x="${Math.round(l.x)}" y="${Math.round(l.y)}" dy="0.35em" text-anchor="${l.anchor}">${esc(l.text)}</text>`);
  }
  out.push('</g></svg>');
  return out.join('');
}

/** The first view, drawn on the server from the same scene NetView draws (default product, last complete year),
 *  so the map is never empty while the scripts load; NetView replaces it after its first frame. */
export function StaticMap({ data, label }: { data: StaticMapData; label: string }) {
  return <div className="gx-static__inner" dangerouslySetInnerHTML={{ __html: staticSvg(data, label) }} />;
}
