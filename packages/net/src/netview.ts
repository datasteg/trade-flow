// NetView: the trade network drawn with D3 on SVG, after the local dashboard's netview.js and the Network maps
// section of the design book. Two layouts: the map (each economy near its centroid on a stretched projection, no two
// circles overlapping, regions as soft tints: maplayout.ts) and a force layout seeded from the map. Economies persist across periods, so playing through time grows, shrinks
// and moves them over 450 ms instead of redrawing. Flows run exporter → importer, curved to the right of travel,
// width ∝ √value. The ground zooms (0.6×–10×); marks keep their pixel size. More than 3,000 flows go to a canvas.
import {
  drag, easeCubicInOut, forceCollide, forceLink, forceManyBody, forceSimulation, forceX, forceY, select,
  zoom as d3zoom, zoomIdentity, type Selection, type Simulation, type ZoomBehavior, type ZoomTransform,
} from 'd3';
import { formatPeriod, formatShare, formatUSD, type Lang } from '@larch/ui/format';
import { anchorOf, fitProjection, loadWorld, type Box, type World } from './geo';
import { curve, edgeGrowth, halfDisc, nodeGrowth, type SizeBy } from './scales';
import { buildScene, declutter, labelWidth, DEFAULT_CONFIG, type Placed, type Scene, type SceneEdge, type SceneNode, type ViewConfig } from './scene';
import { divergeText, estName, ruleName, s } from './strings';
import { flowPoints, HALO, layoutMap, placeRegionNames, regionOf, REGION_KEYS, REGIONS, stretchedSpots, type MapItem, type RegionName } from './maplayout';
import { larchColour, larchNumbers, onThemeChange, v } from './theme';
import type { Meta, NetEdge, Snap } from './types';
import { nodeName, reducedMotion } from './util';
import { formatNet, formatUV, growthText } from './words';
import { josa } from './josa';
import type { GeoProjection } from 'd3';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Sel<E extends Element = Element, D = unknown> = Selection<E, D, any, any>;

export interface Insets { top: number; right: number; bottom: number; left: number }

export interface NetViewOptions {
  lang: Lang;
  meta: Meta;
  /** Hover, click, keyboard and zoom (default true). A non-interactive view is a picture with tooltips off. */
  interactive?: boolean;
  /** Space covered by floating panels, in px: the land is fitted inside the rest. */
  insets?: Partial<Insets>;
  /** The basemap URL (default /world-110m.json). */
  worldUrl?: string;
  /** Selecting an economy (ISO3) or a flow ("CHN>USA"); null clears. */
  onSelectNode?: (iso: string | null) => void;
  onSelectFlow?: (key: string | null) => void;
  /** After every render, with the drawn economies and flows. */
  onRender?: (view: NetView) => void;
  /** The product's name for the takeaway aria-label. */
  productLabel?: string;
  /** Economy tooltips: 'full' (default) or 'brief', name, rank, exports and imports only, placed beside the economy
   *  instead of at the pointer so it never covers it (chain pages, where a side panel holds the rest). */
  tip?: 'full' | 'brief';
}

interface Datum extends Placed {
  id: string;
  fx?: number | null;
  fy?: number | null;
  sn?: SceneNode;
}

interface EdgeDatum extends SceneEdge {
  a: Datum;
  b: Datum;
}

const CANVAS_FLOWS = 3000;
const MARKER_TOKENS = ['edge', 'flow-out', 'flow-in', 'viz-1', 'viz-2', 'viz-3', 'viz-4', 'viz-5', 'viz-6', 'viz-7', 'viz-8', 'div-neg-3', 'div-neg-2', 'div-neg-1', 'div-mid', 'div-pos-1', 'div-pos-2', 'div-pos-3', 'ink'];
/** Fills that say nothing about the economy (no group, no stage): a split node draws no ring for them. */
const PLAIN_FILLS = new Set(['node', 'viz-context']);

let uid = 0;

export class NetView {
  readonly host: HTMLElement;
  private o: NetViewOptions;
  cfg: ViewConfig = { ...DEFAULT_CONFIG };
  snap: Snap | null = null;
  scene: Scene | null = null;
  private world: World | null = null;
  private proj: GeoProjection | null = null;
  private box: Box = { x0: 0, y0: 0, x1: 800, y1: 500 };
  private W = 0;
  private H = 0;
  private fitted = false;
  private worldReady = false;
  private pos = new Map<number, Datum>();
  private slots = new Map<number, number>();
  private slotKey = '';
  private zt: ZoomTransform = zoomIdentity;
  private zoomer: ZoomBehavior<SVGSVGElement, unknown> | null = null;
  private sim: Simulation<Datum, undefined>;
  private hover: { node?: number; edge?: string } = {};
  private id = `ln${++uid}`;
  private ro: ResizeObserver;
  private unTheme: () => void;
  private nodesD: Datum[] = [];
  private edgesD: EdgeDatum[] = [];
  private labelsShown = new Set<number>();
  private canvasMode = false;

  private svgGround: Sel<SVGSVGElement>;
  private gRegions: Sel<SVGGElement>;
  private gRegionNames: Sel<SVGGElement>;
  /** The map's regions and their members, for the tints. */
  private tints: { g: string; members: Datum[] }[] = [];
  /** The map's stretched spots (maplayout.ts step 1), per canvas size. */
  private spots: Map<number, [number, number]> | null = null;
  private canvas: HTMLCanvasElement;
  private svg: Sel<SVGSVGElement>;
  private gGhost: Sel<SVGGElement>;
  private gEdges: Sel<SVGGElement>;
  private gHits: Sel<SVGGElement>;
  private gNodes: Sel<SVGGElement>;
  private gLabels: Sel<SVGGElement>;
  private tip: HTMLDivElement;
  private msg: HTMLDivElement;

  constructor(host: HTMLElement, options: NetViewOptions) {
    this.host = host;
    this.o = { interactive: true, ...options };
    const root = select(host).classed('ln-net', true);
    this.svgGround = root.append('svg').attr('class', 'ln-net__ground').attr('aria-hidden', 'true') as Sel<SVGSVGElement>;
    this.gRegions = this.svgGround.append('g').attr('class', 'ln-regions');
    this.gRegionNames = this.svgGround.append('g').attr('class', 'ln-region-names');
    this.canvas = root.append('canvas').attr('class', 'ln-net__canvas').attr('aria-hidden', 'true').node()!;
    this.svg = root.append('svg').attr('class', 'ln-net__marks').attr('role', 'img') as Sel<SVGSVGElement>;
    const defs = this.svg.append('defs');
    for (const tk of MARKER_TOKENS) {
      defs.append('marker').attr('id', `${this.id}-arr-${tk}`).attr('viewBox', '0 -5 10 10').attr('refX', 8).attr('refY', 0)
        .attr('markerWidth', 6).attr('markerHeight', 6).attr('markerUnits', 'userSpaceOnUse').attr('orient', 'auto')
        .append('path').attr('d', 'M0,-4L10,0L0,4Z').style('fill', v(tk));
    }
    this.gGhost = this.svg.append('g').attr('class', 'ln-ghosts');
    this.gEdges = this.svg.append('g').attr('class', 'ln-edges');
    this.gHits = this.svg.append('g').attr('class', 'ln-hits');
    this.gNodes = this.svg.append('g').attr('class', 'ln-nodes');
    this.gLabels = this.svg.append('g').attr('class', 'ln-labels').attr('aria-hidden', 'true');
    this.tip = root.append('div').attr('class', 'lr-tip ln-tip').attr('role', 'status').node()!;
    this.tip.hidden = true;
    this.msg = root.append('div').attr('class', 'ln-msg').node()!;
    this.msg.textContent = s(this.o.lang, 'loading');

    if (this.o.interactive) {
      this.zoomer = d3zoom<SVGSVGElement, unknown>().scaleExtent([0.6, 10]).on('zoom', (ev) => {
        this.zt = ev.transform;
        this.applyZoom();
      });
      this.svg.call(this.zoomer).on('dblclick.zoom', null);
      this.svg.on('click', (ev: MouseEvent) => {
        if (ev.target === this.svg.node()) { this.o.onSelectNode?.(null); this.o.onSelectFlow?.(null); }
      });
    }
    this.sim = forceSimulation<Datum>().stop().on('tick', () => this.place(0));
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(host);
    this.unTheme = onThemeChange(() => { if (this.canvasMode) this.drawCanvas(); });
    loadWorld(this.o.worldUrl).then((w) => {
      this.world = w;
      this.worldReady = true;
      this.resize(true);
    });
  }

  destroy(): void {
    this.ro.disconnect();
    this.unTheme();
    this.sim.stop();
    select(this.host).selectAll('*').interrupt();
    this.host.replaceChildren();
    this.host.classList.remove('ln-net');
  }

  /** The panels' footprint changed (rail opened, breakpoint crossed): refit the land. */
  setInsets(insets: Partial<Insets>): void {
    const a = this.o.insets ?? {}, b = insets;
    if (a.top === b.top && a.right === b.right && a.bottom === b.bottom && a.left === b.left) return;
    this.o.insets = insets;
    this.resize(true);
  }

  setLang(lang: Lang): void {
    this.o.lang = lang;
    if (this.snap) this.render(this.snap, {}, false);
  }

  setProductLabel(label: string): void {
    this.o.productLabel = label;
  }

  /** A message over the map ("Loading the network…", an error); empty hides it. */
  message(text: string | null): void {
    this.msg.textContent = text ?? '';
    this.msg.hidden = !text;
  }

  /** While the next period loads, the current one stays at opacity-refetch (never an empty frame). */
  setLoading(on: boolean): void {
    this.host.classList.toggle('is-refetch', on);
  }

  /** Back to the whole map. */
  fit(): void {
    if (!this.zoomer) return;
    const t = this.svg.transition().duration(reducedMotion() ? 0 : 400);
    (t as any).call(this.zoomer.transform, zoomIdentity);
  }

  /** Pans so the economy sits inside `visible` (screen px within the host), when a panel covers it. */
  ensureVisible(iso: string, visible: Box): void {
    if (!this.zoomer) return;
    const d = [...this.pos.values()].find((x) => x.id === iso);
    if (!d) return;
    const [sx, sy] = this.zt.apply([d.x, d.y]);
    const pad = 24;
    if (sx >= visible.x0 + pad && sx <= visible.x1 - pad && sy >= visible.y0 + pad && sy <= visible.y1 - pad) return;
    const cx = (visible.x0 + visible.x1) / 2, cy = (visible.y0 + visible.y1) / 2;
    const next = zoomIdentity.translate(this.zt.x + (cx - sx), this.zt.y + (cy - sy)).scale(this.zt.k);
    const t = this.svg.transition().duration(reducedMotion() ? 0 : 450);
    (t as any).call(this.zoomer.transform, next);
  }

  /** Community anchor (node index) → colour slot 0–2, as drawn now (for legends). */
  get slotMap(): Map<number, number> {
    return this.slots;
  }

  /** What is drawn now (for the table view and the takeaway). */
  drawn(): { nodes: SceneNode[]; edges: SceneEdge[] } {
    return { nodes: this.scene?.nodes ?? [], edges: this.scene?.edges ?? [] };
  }

  // -- size and projection ---------------------------------------------------------------------------------------

  private resize(force = false): void {
    const W = this.host.clientWidth || 800, H = this.host.clientHeight || 480;
    if (!force && W === this.W && H === this.H) return;
    if (!this.worldReady) return;
    this.W = W; this.H = H;
    for (const el of [this.svgGround, this.svg]) el.attr('viewBox', `0 0 ${W} ${H}`).attr('width', W).attr('height', H);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(W * dpr); this.canvas.height = Math.round(H * dpr);
    this.canvas.style.width = `${W}px`; this.canvas.style.height = `${H}px`;
    const ins = { top: 8, right: 8, bottom: 8, left: 8, ...this.o.insets };
    this.box = { x0: ins.left, y0: ins.top, x1: W - ins.right, y1: H - ins.bottom };
    // the projection only places the anchors: the map draws no land, since the layout moves economies off it
    this.proj = fitProjection(this.world, this.box);
    this.spots = null;
    for (const d of this.pos.values()) {
      [d.ax, d.ay] = anchorOf(this.o.meta, d.i, this.proj, this.box);
      if (this.cfg.layout === 'map') { d.x = d.ax; d.y = d.ay; }
    }
    this.fitted = true;
    if (this.snap) this.render(this.snap, {}, false);
  }

  // -- render ----------------------------------------------------------------------------------------------------

  /** Draws a snapshot with the given controls (merged into the current ones). `animate` eases sizes and
   *  positions over 450 ms (never under prefers-reduced-motion). */
  render(snap: Snap, cfg: Partial<ViewConfig> = {}, animate = true): void {
    const layoutChanged = cfg.layout !== undefined && cfg.layout !== this.cfg.layout;
    this.snap = snap;
    Object.assign(this.cfg, cfg);
    const key = `${snap.product}|${snap.freq}|${snap.lens ?? snap.rule}`;
    if (key !== this.slotKey) { this.slots.clear(); this.slotKey = key; }
    if (!this.fitted || !this.proj) return;
    const meta = this.o.meta;
    const c = this.cfg;
    const box = this.box;
    const scene = buildScene(meta, snap, c, this.W, this.slots, c.layout === 'map' ? (box.x1 - box.x0) * (box.y1 - box.y0) : undefined);
    this.scene = scene;
    const dur = animate && !reducedMotion() ? 450 : 0;

    // persistent data: an economy keeps its place and grows rather than redraws
    this.nodesD = scene.nodes.map((sn) => {
      let d = this.pos.get(sn.i);
      if (!d) {
        const [ax, ay] = anchorOf(meta, sn.i, this.proj!, this.box);
        d = { i: sn.i, id: sn.id, r: sn.r, ax, ay, x: ax, y: ay };
        this.pos.set(sn.i, d);
      }
      d.r = sn.r;
      d.sn = sn;
      return d;
    });
    const byI = new Map(this.nodesD.map((d) => [d.i, d]));
    this.edgesD = scene.edges.map((se) => ({ ...se, a: byI.get(se.e.s)!, b: byI.get(se.e.t)! }));
    this.canvasMode = this.edgesD.length > CANVAS_FLOWS;

    const show = c.layout === 'map' ? 1 : 0;
    const cross = layoutChanged && !reducedMotion() ? 200 : 0;
    this.svgGround.transition().duration(cross).style('opacity', show);
    if (layoutChanged && cross) this.svg.style('opacity', 0).transition().duration(cross).style('opacity', 1);

    // flows
    const edgeData = this.canvasMode ? [] : this.edgesD;
    const edgeSel = this.gEdges.selectAll<SVGPathElement, EdgeDatum>('path.lr-flow:not(.is-exit)').data(edgeData, (d) => d.key).join(
      (enter) => enter.append('path').attr('class', 'lr-flow').attr('stroke-width', 0),
      (update) => update,
      // leaving: marked, so place() gives it no move transition (that would keep remove() from running)
      (exit) => exit.classed('is-exit', true).transition('w').duration(dur).attr('stroke-width', 0).remove(),
    );
    edgeSel.order();
    edgeSel.classed('is-est', (d) => !!d.e.est).style('stroke', (d) => v(d.stroke)).attr('marker-end', (d) => `url(#${this.id}-arr-${d.stroke})`)
      .transition('w').duration(dur).ease(easeCubicInOut).attr('stroke-width', (d) => d.width);
    const hits = this.gHits.selectAll<SVGPathElement, EdgeDatum>('path.ln-hit').data(this.o.interactive ? edgeData : [], (d) => d.key)
      .join('path').attr('class', 'ln-hit');
    if (this.o.interactive) {
      hits.on('pointerenter', (ev: PointerEvent, d) => { this.hover = { edge: d.key }; this.applyFocus(); this.showEdgeTip(ev, d); })
        .on('pointermove', (ev: PointerEvent) => this.moveTip(ev.clientX, ev.clientY))
        .on('pointerleave', () => { this.hover = {}; this.hideTip(); this.applyFocus(); })
        .on('click', (ev: MouseEvent, d) => { ev.stopPropagation(); this.o.onSelectFlow?.(d.key); });
    }

    // flows of the base that are gone now: faint dashed lines
    this.gGhost.selectAll<SVGPathElement, Scene['ghosts'][number]>('path').data(scene.ghosts, (d) => d.key)
      .join('path').attr('class', 'ln-ghost').attr('stroke-width', (d) => d.width);

    // economies
    const nodeSel = this.gNodes.selectAll<SVGGElement, Datum>('g.ln-node:not(.is-exit)').data(this.nodesD, (d) => String(d.i)).join(
      (enter) => {
        const g = enter.append('g').attr('class', 'ln-node').attr('transform', (d) => this.translate(d));
        g.append('circle').attr('class', 'ln-node__base');
        g.append('path').attr('class', 'ln-half ln-half--m').attr('d', halfDisc(0, 'left'));
        g.append('path').attr('class', 'ln-half ln-half--x').attr('d', halfDisc(0, 'right'));
        g.append('circle').attr('class', 'lr-node').attr('r', 0);
        g.append('circle').attr('class', 'lr-node__focus-ring');
        g.append('circle').attr('class', 'lr-node__choke');
        g.append('circle').attr('class', 'ln-node__outline');
        g.append('circle').attr('class', 'ln-node__hit');
        return g;
      },
      (update) => update,
      (exit) => exit.classed('is-exit', true).style('pointer-events', 'none').transition('r').duration(dur).style('opacity', 0).remove(),
    );
    nodeSel.order();
    const tab = new Set(scene.tabbable);
    nodeSel.classed('is-selected', (d) => !!d.sn?.selected)
      .attr('tabindex', (d) => (this.o.interactive && tab.has(d.i) ? 0 : null))
      .attr('role', this.o.interactive ? 'button' : null)
      .attr('aria-label', (d) => this.nodeAria(d));
    // split nodes: imports on the left, exports on the right, the colour mode's token as a ring
    const split = c.sizeBy === 'split';
    nodeSel.classed('ln-node--split', split);
    nodeSel.select<SVGPathElement>('path.ln-half--m').style('display', () => (split ? null : 'none'))
      .transition('r').duration(dur).ease(easeCubicInOut).attr('d', (d) => halfDisc(d.sn?.rm ?? 0, 'left'));
    nodeSel.select<SVGPathElement>('path.ln-half--x').style('display', () => (split ? null : 'none'))
      .transition('r').duration(dur).ease(easeCubicInOut).attr('d', (d) => halfDisc(d.sn?.rx ?? 0, 'right'));
    const ring = (d: Datum) => (split && d.sn?.fill && !PLAIN_FILLS.has(d.sn.fill) ? d.sn.fill : null);
    nodeSel.select<SVGCircleElement>('circle.lr-node')
      .classed('lr-node--selected', (d) => !split && !!d.sn?.selected)
      .classed('ln-node--hollow', (d) => !split && d.sn?.fill == null)
      .classed('ln-node--ring', (d) => !!ring(d))
      .style('fill', (d) => (split ? 'none' : d.sn?.selected ? v('node-selected') : d.sn?.fill ? v(d.sn.fill) : 'none'))
      .style('stroke', (d) => (split ? (ring(d) ? v(ring(d)!) : 'none') : null))
      .transition('r').duration(dur).ease(easeCubicInOut).attr('r', (d) => (split ? d.r + 1.5 : d.r));
    nodeSel.select('circle.lr-node__focus-ring').attr('r', (d) => d.r + 2.5).style('display', (d) => (d.sn?.selected ? null : 'none'));
    nodeSel.select('circle.lr-node__choke').attr('r', (d) => d.r + (d.sn?.selected ? 5 : 3)).style('display', (d) => (d.sn?.choke ? null : 'none'));
    nodeSel.select('circle.ln-node__outline').attr('r', (d) => d.r + 6).style('display', (d) => (d.sn?.outline ? null : 'none'));
    nodeSel.select('circle.ln-node__base').attr('r', (d) => d.sn?.baseR ?? 0).style('display', (d) => (d.sn?.baseR ? null : 'none'));
    nodeSel.select('circle.ln-node__hit').attr('r', (d) => Math.max(d.r, 12));
    if (this.o.interactive) {
      nodeSel.on('pointerenter', (ev: PointerEvent, d) => { this.hover = { node: d.i }; this.applyFocus(); this.showNodeTip(ev.clientX, ev.clientY, d); })
        .on('pointermove', (ev: PointerEvent) => { if (this.o.tip !== 'brief') this.moveTip(ev.clientX, ev.clientY); })
        .on('pointerleave', () => { this.hover = {}; this.hideTip(); this.applyFocus(); })
        .on('focus', (_ev: FocusEvent, d) => { this.hover = { node: d.i }; this.applyFocus(); const b = this.host.getBoundingClientRect(); const [sx, sy] = this.zt.apply([d.x, d.y]); this.showNodeTip(b.left + sx + d.r, b.top + sy, d); })
        .on('blur', () => { this.hover = {}; this.hideTip(); this.applyFocus(); })
        .on('keydown', (ev: KeyboardEvent, d) => {
          if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); this.o.onSelectNode?.(d.id); }
        })
        .on('click', (ev: MouseEvent, d) => { ev.stopPropagation(); this.o.onSelectNode?.(d.id); })
        .call(drag<SVGGElement, Datum>()
          .filter((ev: any) => this.cfg.layout === 'force' && !ev.button)
          .subject((_ev, d) => { const [x, y] = this.zt.apply([d.x, d.y]); return { x, y }; })
          .on('start', (_ev, d) => { this.sim.alphaTarget(0.2).restart(); d.fx = d.x; d.fy = d.y; })
          .on('drag', (ev, d) => { const [x, y] = this.zt.invert([ev.x, ev.y]); d.fx = x; d.fy = y; })
          .on('end', (_ev, d) => { this.sim.alphaTarget(0); d.fx = null; d.fy = null; }));
    }

    this.svg.attr('aria-label', this.takeaway());
    this.layout(dur);
    this.applyFocus();
    if (this.canvasMode) this.drawCanvas(); else this.clearCanvas();
    this.message(null);
    this.o.onRender?.(this);
  }

  private layout(dur: number): void {
    const c = this.cfg;
    this.sim.stop();
    if (c.layout === 'map') {
      for (const d of this.nodesD) { d.fx = null; d.fy = null; }
      const meta = this.o.meta, proj = this.proj!;
      if (!this.spots) this.spots = stretchedSpots(meta.nodes.map((_, k) => { const [x, y] = anchorOf(meta, k, proj, this.box); return { k, x, y }; }), this.box);
      const spots = this.spots;
      const items: MapItem[] = this.nodesD.map((d) => ({ i: d.i, r: d.r, x: d.x, y: d.y }));
      layoutMap(items, (i) => spots.get(i) ?? [this.box.x0 + 30, this.box.y1 - 30], this.box);
      items.forEach((it, k) => { this.nodesD[k].x = it.x; this.nodesD[k].y = it.y; });
      this.tints = REGION_KEYS.map((g) => ({ g, members: this.nodesD.filter((d) => regionOf(meta, d.i) === g) })).filter((t) => t.members.length);
      this.drawTints();
      this.place(dur);
    } else {
      const world = this.snap?.world || 1;
      const links = this.edgesD.map((e) => ({ source: e.a, target: e.b, share: e.e.value / world }));
      this.sim.nodes(this.nodesD)
        .force('link', forceLink<Datum, { source: Datum; target: Datum; share: number }>(links).distance(70).strength((l) => Math.min(0.6, 0.04 + 40 * l.share)))
        .force('charge', forceManyBody<Datum>().strength((d) => -40 - d.r * 6))
        .force('collide', forceCollide<Datum>((d) => d.r + 2))
        .force('cx', forceX<Datum>((this.box.x0 + this.box.x1) / 2).strength(0.04))
        .force('cy', forceY<Datum>((this.box.y0 + this.box.y1) / 2).strength(0.06))
        .force('x', null).force('y', null);
      if (reducedMotion()) {
        this.sim.alpha(1);
        for (let k = 0; k < 220; k++) this.sim.tick();
        this.place(0);
      } else {
        this.sim.alpha(0.5).restart();
        this.place(0);
      }
    }
  }

  /** The map's ground: a soft tint per region (a disc of radius + HALO px around every member, in screen space, so
   *  it keeps its size when zooming), in the region's colour when colouring by region, else neutral. */
  private drawTints(): void {
    const byRegion = this.cfg.colorBy === 'region';
    const regs = this.gRegions.selectAll<SVGGElement, { g: string; members: Datum[] }>('g.ln-region').data(this.tints, (r) => r.g)
      .join((e) => e.append('g').attr('class', 'ln-region'));
    regs.style('fill', (r) => v(byRegion ? REGIONS[r.g]?.colour ?? 'ink' : 'ink')).classed('ln-region--plain', !byRegion);
    // a new disc starts where its economy is drawn now; place() moves them all with the economies
    regs.selectAll<SVGCircleElement, Datum>('circle').data((r) => r.members, (d) => String(d.i))
      .join((e) => e.append('circle').attr('cx', this.tintX).attr('cy', this.tintY).attr('r', this.tintR));
  }

  private tintX = (d: Datum): number => this.screen(d).x;
  private tintY = (d: Datum): number => this.screen(d).y;
  private tintR = (d: Datum): number => d.r + HALO;

  private placeTints(dur: number): void {
    const discs = this.gRegions.selectAll<SVGCircleElement, Datum>('circle');
    if (dur) discs.transition('move').duration(dur).ease(easeCubicInOut).attr('cx', this.tintX).attr('cy', this.tintY).attr('r', this.tintR);
    else discs.interrupt('move').attr('cx', this.tintX).attr('cy', this.tintY).attr('r', this.tintR);
  }

  /** The regions' names, in screen space after the economies' labels (they never cover one). */
  private regionNames(taken: { x0: number; y0: number; x1: number; y1: number }[]): void {
    const meta = this.o.meta;
    if (this.cfg.layout !== 'map') { this.gRegionNames.selectAll('text').remove(); return; }
    // names keep off the busy middle: points along the 600 largest flows (the edges run small to large)
    const busy = flowPoints(this.edgesD.slice(-600).map((e) => ({ a: this.screen(e.a), b: this.screen(e.b) })));
    const names: RegionName[] = placeRegionNames(
      this.nodesD.map((d) => ({ ...this.screen(d), g: regionOf(meta, d.i) })), taken,
      { x0: 0, y0: 0, x1: this.W, y1: this.H }, (g) => REGIONS[g]?.[this.o.lang] ?? g, busy);
    this.gRegionNames.selectAll<SVGTextElement, RegionName>('text').data(names, (n) => n.g).join('text')
      .attr('class', 'lr-mapregion ln-region-name').attr('dy', '0.35em')
      .attr('text-anchor', (n) => n.anchor).attr('x', (n) => n.x).attr('y', (n) => n.y).text((n) => n.text);
  }

  private translate(d: Datum): string {
    const [x, y] = this.zt.apply([d.x, d.y]);
    return `translate(${Math.round(x * 10) / 10},${Math.round(y * 10) / 10})`;
  }

  private screen(d: Datum): { x: number; y: number; r: number } {
    const [x, y] = this.zt.apply([d.x, d.y]);
    return { x, y, r: d.r };
  }

  private arc = (d: { a: Datum; b: Datum }): string => {
    const a = this.screen(d.a), b = this.screen(d.b);
    return curve(a, b);
  };

  private place(dur: number): void {
    const nodes = this.gNodes.selectAll<SVGGElement, Datum>('g.ln-node:not(.is-exit)');
    const edges = this.gEdges.selectAll<SVGPathElement, EdgeDatum>('path.lr-flow:not(.is-exit)');
    if (dur) {
      nodes.transition('move').duration(dur).ease(easeCubicInOut).attr('transform', (d) => this.translate(d));
      edges.transition('move').duration(dur).ease(easeCubicInOut).attr('d', this.arc);
    } else {
      nodes.interrupt('move').attr('transform', (d) => this.translate(d));
      edges.interrupt('move').attr('d', this.arc);
    }
    this.gHits.selectAll<SVGPathElement, EdgeDatum>('path.ln-hit').attr('d', this.arc);
    if (this.cfg.layout === 'map') this.placeTints(dur);
    const byI = new Map(this.nodesD.map((d) => [d.i, d]));
    this.gGhost.selectAll<SVGPathElement, Scene['ghosts'][number]>('path').attr('d', (g) => {
      const a = byI.get(g.s), b = byI.get(g.t);
      return a && b ? this.arc({ a, b }) : '';
    });
    this.labels(dur);
    if (this.canvasMode) this.drawCanvas();
  }

  private applyZoom(): void {
    this.place(0);
  }

  // -- labels -----------------------------------------------------------------------------------------------------

  private labelText(i: number): string {
    const meta = this.o.meta;
    if (this.cfg.layout === 'force' && this.zt.k < 1.5) return meta.nodes[i]?.id ?? '';
    return nodeName(meta, i, this.o.lang);
  }

  private labels(dur: number): void {
    const scene = this.scene;
    if (!scene) return;
    const at = new Map(this.nodesD.map((d) => [d.i, this.screen(d)]));
    const strong = new Set<number>(scene.nodes.slice(0, 5).map((d) => d.i));
    if (scene.focusIndex != null) strong.add(scene.focusIndex);
    const boxes = declutter(scene.labelled, at, (i) => this.labelText(i), this.W, scene.focusIndex, strong, this.cfg.layout === 'map');
    this.labelsShown = new Set(boxes.map((b) => b.i));
    const sel = this.gLabels.selectAll<SVGTextElement, typeof boxes[number]>('text').data(boxes, (b) => String(b.i)).join('text');
    sel.attr('class', (b) => `lr-maplabel${b.strong ? ' lr-maplabel--strong' : ''}`)
      .attr('text-anchor', (b) => b.anchor).attr('dy', '0.35em').text((b) => b.text);
    if (dur) sel.transition('move').duration(dur).attr('x', (b) => b.x).attr('y', (b) => b.y);
    else sel.interrupt('move').attr('x', (b) => b.x).attr('y', (b) => b.y);
    this.regionNames(boxes.map((b) => {
      const size = b.strong ? 13 : 12, w = labelWidth(b.text, size);
      const x0 = b.anchor === 'start' ? b.x : b.anchor === 'end' ? b.x - w : b.x - w / 2;
      return { x0, y0: b.y - size / 2 - 1, x1: x0 + w, y1: b.y + size / 2 + 1 };
    }));
  }

  // -- focus and hover --------------------------------------------------------------------------------------------

  private applyFocus(): void {
    const node = this.hover.node ?? this.scene?.focusIndex ?? null;
    const flowKey = this.hover.edge ?? (this.hover.node == null ? this.cfg.flow : null);
    const edges = this.gEdges.selectAll<SVGPathElement, EdgeDatum>('path.lr-flow:not(.is-exit)');
    const role = (d: EdgeDatum): 'sel' | 'out' | 'in' | 'dim' | 'none' => {
      if (flowKey) return d.key === flowKey ? 'sel' : 'dim';
      if (node != null) return d.e.s === node ? 'out' : d.e.t === node ? 'in' : 'dim';
      return 'none';
    };
    edges.each(function (d) {
      const r = role(d);
      const el = select(this);
      el.classed('lr-flow--out', r === 'out' || r === 'sel').classed('lr-flow--in', r === 'in').classed('lr-flow--dim', r === 'dim');
    });
    const view = this;
    edges.style('stroke', (d) => { const r = role(d); return r === 'out' || r === 'sel' ? v('flow-out') : r === 'in' ? v('flow-in') : v(d.stroke); })
      .attr('marker-end', (d) => { const r = role(d); const tk = r === 'out' || r === 'sel' ? 'flow-out' : r === 'in' ? 'flow-in' : d.stroke; return `url(#${view.id}-arr-${tk})`; });
    // the highlighted flows above all others
    edges.filter((d) => { const r = role(d); return r === 'out' || r === 'in' || r === 'sel'; }).raise();
    this.gGhost.classed('is-dim', node != null || !!flowKey);
    if (this.canvasMode) this.drawCanvas();
  }

  // -- canvas flows (more than 3,000) --------------------------------------------------------------------------------

  private clearCanvas(): void {
    const ctx = this.canvas.getContext('2d');
    ctx?.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.canvas.hidden = true;
  }

  private drawCanvas(): void {
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    this.canvas.hidden = false;
    const dpr = this.canvas.width / (this.W || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.W, this.H);
    const nums = larchNumbers();
    const colours = new Map<string, string>();
    const col = (tk: string) => { let c = colours.get(tk); if (!c) { c = larchColour(tk); colours.set(tk, c); } return c; };
    const node = this.hover.node ?? this.scene?.focusIndex ?? null;
    ctx.lineCap = 'round';
    for (const d of this.edgesD) {
      const a = this.screen(d.a), b = this.screen(d.b);
      const out = node != null && d.e.s === node, inn = node != null && d.e.t === node;
      ctx.globalAlpha = node == null ? nums.edgeOpacity : out || inn ? 1 : nums.edgeDim;
      ctx.strokeStyle = col(out ? 'flow-out' : inn ? 'flow-in' : d.stroke);
      ctx.lineWidth = d.width;
      ctx.stroke(new Path2D(curve(a, b)));
    }
    ctx.globalAlpha = 1;
  }

  // -- tooltips -----------------------------------------------------------------------------------------------------

  private showNodeTip(cx: number, cy: number, d: Datum): void {
    const lang = this.o.lang, snap = this.snap, meta = this.o.meta;
    if (!snap || !d.sn) return;
    const n = d.sn.n;
    if (this.o.tip === 'brief') {
      this.fillTip(nodeName(meta, n.i, lang), n.id, s(lang, 'rankTrade', { n: n.rankTotal }),
        [[s(lang, 'exports'), formatUSD(n.exports, lang)], [s(lang, 'imports'), formatUSD(n.imports, lang)]], []);
      this.besideNode(d);
      return;
    }
    const rows: [string, string][] = [
      [s(lang, 'exports'), formatUSD(n.exports, lang)],
      [s(lang, 'imports'), formatUSD(n.imports, lang)],
      [s(lang, 'net'), formatNet(n.net, lang)],
      [s(lang, 'shareWorld'), formatShare(n.share, lang, { decimals: n.share < 0.01 ? 1 : 0 })],
    ];
    if (n.exports > 0 && n.imports > 0 && n.gl != null) rows.push([s(lang, 'gl'), n.gl.toFixed(2)]);
    if (n.ux != null) rows.push([s(lang, 'uvExports'), formatUV(n.ux, lang)]);
    if (n.um != null) rows.push([s(lang, 'uvImports'), formatUV(n.um, lang)]);
    if (n.topSup >= 0 && n.topSupShare != null) rows.push([s(lang, 'topSupplier', { name: nodeName(meta, n.topSup, lang) }), formatShare(n.topSupShare, lang)]);
    const sizeBy: SizeBy = this.cfg.sizeBy;
    if (sizeBy === 'pagerank' && n.pv != null) rows.push(['PageRank', n.pv.toFixed(4)]);
    if (sizeBy === 'betweenness' && n.bt != null) rows.push([lang === 'ko' ? '매개 중심성' : 'Betweenness', n.bt.toFixed(4)]);
    if (sizeBy === 'degree') rows.push([lang === 'ko' ? '교역상대국 수' : 'Partners', `${n.outDeg} / ${n.inDeg}`]);
    if (this.cfg.colorBy === 'change' && this.scene?.colour.base) {
      const g = nodeGrowth(n, this.scene.colour);
      rows.push([s(lang, 'changeVs', { base: formatPeriod(this.scene.colour.base.t, lang) }), growthText(g, lang)]);
    }
    const notes: { text: string; choke?: boolean }[] = [];
    if (d.sn.choke) notes.push({ text: `${s(lang, 'chokepoint')}: ${s(lang, 'chokepointNote')}`, choke: true });
    if (n.nes) notes.push({ text: s(lang, 'nesNote') });   // Asia, n.e.s.: not an economy, and never Taiwan
    else if (!n.reported) notes.push({ text: s(lang, 'didNotReport', { t: formatPeriod(snap.t, lang) }) });
    this.fillTip(nodeName(meta, n.i, lang), n.id, s(lang, 'rankTrade', { n: n.rankTotal }), rows, notes);
    this.moveTip(cx, cy);
  }

  private showEdgeTip(ev: PointerEvent, d: EdgeDatum): void {
    const lang = this.o.lang, meta = this.o.meta, snap = this.snap;
    if (!snap) return;
    const e: NetEdge = d.e;
    const si = meta.nodes[e.s]?.id ?? '', ti = meta.nodes[e.t]?.id ?? '';
    const rows: [string, string][] = [
      [`${s(lang, 'drawn')} (${e.est ? estName(lang, e.est, e.ky) : s(lang, e.src === 1 ? 'fromImporter' : 'fromExporter')})`, formatUSD(e.value, lang)],
      [`${s(lang, 'importerRep')} ${ti}`, formatUSD(e.vm, lang)],
      [`${s(lang, 'exporterRep')} ${si}`, formatUSD(e.vx, lang)],
      [s(lang, 'mirrorGap'), e.mr == null ? '–' : e.mr.toFixed(2)],
      [s(lang, 'reportGap'), e.asym == null ? '–' : formatShare(e.asym, lang)],
      [s(lang, 'rankOut', { s: si }), `#${e.ro}`],
      [s(lang, 'rankIn', { t: ti }), `#${e.ri}`],
    ];
    if (e.uv != null) rows.splice(1, 0, [s(lang, 'uvFlow'), formatUV(e.uv, lang)]);
    if (this.cfg.colorBy === 'change' && this.scene?.colour.base) {
      rows.push([s(lang, 'changeVs', { base: formatPeriod(this.scene.colour.base.t, lang) }), growthText(edgeGrowth(e, this.scene.colour), lang)]);
    }
    const notes = e.disagree ? [{ text: `\u26A0 ${s(lang, 'disagree')}: ${s(lang, 'disagreeNote')}` }] : [];
    if (e.est) notes.push({ text: `${s(lang, 'estimate')}: ${s(lang, 'estNote')}` });
    if (e.dv) notes.push({ text: `\u26A0 ${divergeText(lang, e)}` });
    const how = snap.wlen ? s(lang, 'window', { w: snap.wlen }) : ruleName(lang, snap.rule);
    this.fillTip(`${si}→${ti}`, null, `${nodeName(meta, e.s, lang)} → ${nodeName(meta, e.t, lang)} · ${how}`, rows, notes);
    this.moveTip(ev.clientX, ev.clientY);
  }

  private fillTip(title: string, iso: string | null, sub: string, rows: [string, string][], notes: { text: string; choke?: boolean }[]): void {
    const tip = this.tip;
    tip.replaceChildren();
    const h = document.createElement('p');
    h.className = 'lr-tip__title';
    h.append(document.createTextNode(title));
    if (iso) { const sp = document.createElement('span'); sp.className = 'lr-iso'; sp.textContent = iso; h.append(' ', sp); }
    tip.append(h);
    if (sub) { const p = document.createElement('p'); p.className = 'ln-tip__sub'; p.textContent = sub; tip.append(p); }
    const dl = document.createElement('dl');
    for (const [k, val] of rows) {
      const dt = document.createElement('dt'); dt.textContent = k;
      const dd = document.createElement('dd'); dd.textContent = val;
      dl.append(dt, dd);
    }
    tip.append(dl);
    for (const n of notes) {
      const p = document.createElement('p');
      p.className = 'lr-tip__note';
      if (n.choke) {
        const [word, ...rest] = n.text.split(': ');
        const b = document.createElement('span'); b.className = 'lr-tip__choke'; b.textContent = word;
        p.append(b, document.createTextNode(rest.length ? `: ${rest.join(': ')}` : ''));
      } else p.textContent = n.text;
      tip.append(p);
    }
    tip.hidden = false;
  }

  private moveTip(cx: number, cy: number): void {
    const tip = this.tip;
    if (tip.hidden) return;
    const b = this.host.getBoundingClientRect();
    const w = tip.offsetWidth, h = tip.offsetHeight;
    let x = cx - b.left + 12, y = cy - b.top + 12;
    if (x + w > b.width - 8) x = cx - b.left - w - 12;
    if (y + h > b.height - 8) y = cy - b.top - h - 12;
    tip.style.left = `${Math.max(8, x)}px`;
    tip.style.top = `${Math.max(8, y)}px`;
  }

  /** The tip beside an economy's circle: right of it, else left, else above or below; never over it. */
  private besideNode(d: Datum): void {
    const tip = this.tip;
    const b = this.host.getBoundingClientRect();
    const [sx, sy] = this.zt.apply([d.x, d.y]);
    const r = Math.max(d.r, d.sn?.rx ?? 0, d.sn?.rm ?? 0) + 8;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    const top = Math.min(Math.max(8, sy - h / 2), Math.max(8, b.height - h - 8));
    let x: number, y = top;
    if (sx + r + w <= b.width - 8) x = sx + r;
    else if (sx - r - w >= 8) x = sx - r - w;
    else {
      x = Math.min(Math.max(8, sx - w / 2), Math.max(8, b.width - w - 8));
      y = sy - r - h >= 8 ? sy - r - h : sy + r;
    }
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  private hideTip(): void {
    this.tip.hidden = true;
  }

  // -- words ----------------------------------------------------------------------------------------------------------

  private nodeAria(d: Datum): string {
    const lang = this.o.lang;
    const n = d.sn?.n;
    if (!n) return d.id;
    return `${nodeName(this.o.meta, n.i, lang)} ${n.id}: ${s(lang, 'exports')} ${formatUSD(n.exports, lang)}, ${s(lang, 'imports')} ${formatUSD(n.imports, lang)}, ${s(lang, 'net')} ${formatNet(n.net, lang)}, ${s(lang, 'rankTrade', { n: n.rankTotal })}`;
  }

  /** The map's takeaway: "Lithium-ion cells, 2024: China supplies 60% of world exports; the largest flow is CHN→USA". */
  takeaway(): string {
    const snap = this.snap, lang = this.o.lang, meta = this.o.meta;
    if (!snap) return s(lang, 'mapLabel');
    const top = snap.tot.top1_id;
    const largest = snap.edges[0];
    const what = this.o.productLabel ? `${this.o.productLabel}, ${formatPeriod(snap.t, lang)}` : formatPeriod(snap.t, lang);
    if (lang === 'ko') {
      return `${what}: ${josa(nodeName(meta, top, lang), '이')} 세계 수출의 ${josa(josa(formatShare(snap.tot.top1, lang), '을'), '을')} 공급합니다${largest ? `, 최대 흐름은 ${largest.key.replace('>', '→')}` : ''}. ${s(lang, 'mapLabel')}`;
    }
    return `${what}: ${nodeName(meta, top, lang)} supplies ${formatShare(snap.tot.top1, lang)} of world exports${largest ? `; the largest flow is ${largest.key.replace('>', '→')}` : ''}. ${s(lang, 'mapLabel')}`;
  }

  /** Whether an economy's label is on the map now. */
  labelled(iso: string): boolean {
    const d = [...this.pos.values()].find((x) => x.id === iso);
    return !!d && this.labelsShown.has(d.i);
  }
}
