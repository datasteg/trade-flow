// The projection behind the map layout: Natural Earth 1:110m (world-atlas countries-110m, public domain) as land
// without Antarctica, projected with d3.geoNaturalEarth1 fitted to the land. The land itself is not drawn (the map
// layout, maplayout.ts, moves economies off it); it only sets the projection's extent. Pure functions: used by the
// server-rendered first view and by NetView alike, so both place the economies in the same spots.
import { geoNaturalEarth1, type GeoProjection } from 'd3';
import { merge, mesh } from 'topojson-client';
import type { GeometryCollection, Topology } from 'topojson-specification';
import type { Feature, MultiLineString, MultiPolygon } from 'geojson';
import type { Meta } from './types';

export interface World {
  land: Feature<MultiPolygon>;
  borders: MultiLineString;
}

const ANTARCTICA = '010';

export function worldFromTopology(topo: Topology): World {
  const countries = topo.objects.countries as GeometryCollection;
  const geoms = countries.geometries.filter((g) => String(g.id) !== ANTARCTICA);
  const land = { type: 'Feature', properties: {}, geometry: merge(topo, geoms as never) } as Feature<MultiPolygon>;
  const borders = mesh(topo, { ...countries, geometries: geoms } as GeometryCollection, (a, b) => a !== b) as MultiLineString;
  return { land, borders };
}

let worldPromise: Promise<World | null> | null = null;

/** The basemap from the app's own public/ folder (never a tile server). Null when it cannot be loaded: the
 *  network is then drawn on a projection fitted to the globe, without land. */
export function loadWorld(url = '/world-110m.json'): Promise<World | null> {
  if (!worldPromise) {
    worldPromise = fetch(url)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${url}: HTTP ${r.status}`))))
      .then((t: Topology) => worldFromTopology(t))
      .catch(() => null);
  }
  return worldPromise;
}

export interface Box { x0: number; y0: number; x1: number; y1: number }

/** Natural Earth I fitted to the land inside a box (or the sphere when there is no land). */
export function fitProjection(world: World | null, box: Box): GeoProjection {
  const p = geoNaturalEarth1();
  const extent: [[number, number], [number, number]] = [[box.x0, box.y0], [Math.max(box.x0 + 10, box.x1), Math.max(box.y0 + 10, box.y1)]];
  if (world) p.fitExtent(extent, world.land);
  else p.fitExtent(extent, { type: 'Sphere' } as never);
  return p;
}

/** An economy's anchor (its centroid) in screen coordinates; economies without coordinates sit at the bottom left. */
export function anchorOf(meta: Meta, i: number, proj: GeoProjection, box: Box): [number, number] {
  const n = meta.nodes[i];
  if (n && n.lat != null && n.lon != null) {
    const p = proj([n.lon, n.lat]);
    if (p) return [p[0], p[1]];
  }
  return [box.x0 + 30, box.y1 - 30];
}
