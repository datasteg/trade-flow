# The map layout

The explorer's **Map** layout (and every NetView map: chain stage maps, event maps, the server-rendered first
view) places each economy near where people expect it, with no two circles overlapping. It replaced the old
layout on 25 Oct 2026. The old one put each economy at its projected centroid on a Natural Earth basemap and nudged
overlapping circles by at most their radius, so Europe and East Asia stayed stacked and the oceans stayed empty.

Code: `packages/net/src/maplayout.ts` (tunables at the top), used by `netview.ts` and `scene.ts` (`staticScene`).
Tests: `packages/net/test/maplayout.test.ts`.

## How it works

1. **Stretch** (data-independent, once per canvas size). The projected centroids of all 273 economies in
   `meta.json` are stretched along each axis by a monotone rank transform: each economy gets equal room, blended
   with the projection (`STRETCH_X` 0.7, `STRETCH_Y` 0.6). Dense Europe and East Asia get more room, the oceans
   less, and left/right and up/down order is kept.
2. **Collision** (every drawing). From the stretched spots, a d3 force layout pulls each economy back to its spot
   (`ANCHOR_STRENGTH` 0.3) and collides circles at their radius plus a little personal space (`GAP`, 0.9% of the
   box width). A final pass pushes apart any overlap left, inside the box.
3. **Fill guard.** If the circles' bounding squares would cover more than `MAX_FILL` (45%) of the box, every
   radius shrinks by the same factor (`buildScene(…, fitArea)`). Only sizing by number of partners triggers it:
   most economies have many partners, and those circles cover 65% of the desktop box.
4. **Ground.** No land is drawn, because it would not line up with the moved economies. Each region gets a soft tint
   (a disc of radius + 14 px around every member, in the region's colour when colouring by region, otherwise
   neutral) and its name beside its core. A name is never drawn over a circle, an economy's label or a busy bundle
   of flows; one with no free spot is left out.

The stretch does not depend on the data and the collision always starts from the stretched spots, so the same
input gives the same positions. Positions move only as much as the sizes change: stepping through the years moves
an economy about a quarter of a pixel on average. Size changes go through the existing 450 ms transition.

The map's labels may also go left of, above or below an economy, not only to its right (`declutter(…, around)`).
The force layout keeps its right-or-left labels.

## The comparison

Candidates (25 Oct 2026, behind a temporary `?layout=` switch, since removed):

- **A**: geographic Dorling. Pull to the projected centroid at strength 0.05, 0.15 or 0.4, and collide.
- **B**: stretch weighted by circle size (2r + 6 per economy), then collide.
- **C**: regional schematic. The eight regions are blocks in four columns west to east, sized by their members.
  Inside each block, a geographic Dorling.
- **D**: stretch with equal room per economy, over all economies in meta (independent of the data), then collide.
- **E**: D plus personal space between circles. **Chosen.**

Test cases: all goods 2024, lithium hydroxide 2024 (HS 2825.20, 96 economies, 63 flows) and all goods 2000. Two
views: the desktop box at 1440 × 900 (1080 × 764 px) and the phone box at 390 px (374 × 580 px). Metrics:

- Overlapping pairs and their area.
- Labels: of the 25 or 50 largest economies, how many cannot be placed (the current layout with its right-or-left
  placer, the candidates with the four-way placer).
- Displacement from the projected centroid, as a share of the box width.
- Share of pairs whose left/right and up/down order is kept.
- Crossing pairs of drawn flows.
- Share of flow length under other economies' circles.
- Circle area over the circles' bounding box, and that bounding box's share of the drawing box.
- Compute time: median of three, Node 22. These timings were noisy.

Stability is the movement between consecutive years, all goods 2015–2024.

**Desktop, TOTAL 2024**

| Candidate | Overlap pairs (area px²) | Labels dropped, top 25 / 50 | Displacement mean / max | Order kept | Flow crossings | Flow length under circles | Circle cover of bbox | Bbox share of box | ms |
|---|---|---|---|---|---|---|---|---|---|
| Current (settle on map) | 53 (1257) | 8 / 25 | 0.001 / 0.015 | 0.997 | 1724 | 15.9% | 5.1% | 68% | 18 |
| A1 Geo Dorling, pull 0.05 | 0 (0) | 3 / 15 | 0.003 / 0.027 | 0.994 | 1721 | 12.5% | 5.1% | 68% | 80 |
| A2 Geo Dorling, pull 0.15 | 0 (0) | 3 / 15 | 0.003 / 0.027 | 0.994 | 1730 | 12.7% | 5.1% | 68% | 102 |
| A3 Geo Dorling, pull 0.4 | 0 (0) | 3 / 15 | 0.003 / 0.028 | 0.994 | 1729 | 12.9% | 5.1% | 68% | 106 |
| B Size-weighted stretch + collision | 0 (0) | 2 / 4 | 0.099 / 0.204 | 1.000 | 1875 | 4.5% | 3.6% | 95% | 36 |
| C Regional schematic | 0 (0) | 0 / 3 | 0.241 / 0.761 | 0.877 | 2683 | 5.4% | 3.6% | 94% | 22 |
| D Equal-count stretch + collision | 0 (0) | 1 / 6 | 0.092 / 0.178 | 1.000 | 1771 | 6.7% | 3.7% | 92% | 74 |
| **E = D + personal space (chosen)** | 0 (0) | 1 / 3 | 0.104 / 0.193 | 0.998 | 1769 | 5.3% | 3.7% | 93% | 75 |

**Desktop, Li hydroxide 2024 (HS 2825.20)**

| Candidate | Overlap pairs (area px²) | Labels dropped, top 25 / 50 | Displacement mean / max | Order kept | Flow crossings | Flow length under circles | Circle cover of bbox | Bbox share of box | ms |
|---|---|---|---|---|---|---|---|---|---|
| Current (settle on map) | 0 (0) | 6 / 20 | 0.000 / 0.017 | 1.000 | 149 | 4.2% | 3.3% | 36% | 3 |
| A1 Geo Dorling, pull 0.05 | 0 (0) | 2 / 12 | 0.000 / 0.017 | 1.000 | 148 | 4.1% | 3.3% | 36% | 12 |
| A2 Geo Dorling, pull 0.15 | 0 (0) | 2 / 12 | 0.000 / 0.017 | 1.000 | 148 | 4.1% | 3.3% | 36% | 12 |
| A3 Geo Dorling, pull 0.4 | 0 (0) | 2 / 12 | 0.000 / 0.017 | 1.000 | 148 | 4.1% | 3.3% | 36% | 12 |
| B Size-weighted stretch + collision | 0 (0) | 0 / 1 | 0.155 / 0.261 | 1.000 | 193 | 1.1% | 1.3% | 95% | 11 |
| C Regional schematic | 0 (0) | 0 / 2 | 0.267 / 0.397 | 0.877 | 193 | 0.8% | 1.3% | 94% | 6 |
| D Equal-count stretch + collision | 0 (0) | 0 / 3 | 0.102 / 0.173 | 1.000 | 175 | 2.4% | 1.8% | 66% | 11 |
| **E = D + personal space (chosen)** | 0 (0) | 0 / 3 | 0.113 / 0.189 | 0.999 | 182 | 1.6% | 1.7% | 69% | 12 |

**Desktop, TOTAL 2000**

| Candidate | Overlap pairs (area px²) | Labels dropped, top 25 / 50 | Displacement mean / max | Order kept | Flow crossings | Flow length under circles | Circle cover of bbox | Bbox share of box | ms |
|---|---|---|---|---|---|---|---|---|---|
| Current (settle on map) | 10 (82) | 10 / 24 | 0.001 / 0.008 | 0.999 | 1045 | 7.4% | 1.7% | 68% | 11 |
| A1 Geo Dorling, pull 0.05 | 0 (0) | 3 / 12 | 0.001 / 0.011 | 0.999 | 1034 | 8.1% | 1.7% | 67% | 40 |
| A2 Geo Dorling, pull 0.15 | 0 (0) | 3 / 12 | 0.001 / 0.011 | 0.999 | 1034 | 8.1% | 1.7% | 67% | 53 |
| A3 Geo Dorling, pull 0.4 | 0 (0) | 3 / 12 | 0.001 / 0.011 | 0.999 | 1033 | 8.0% | 1.7% | 67% | 52 |
| B Size-weighted stretch + collision | 0 (0) | 2 / 3 | 0.097 / 0.199 | 1.000 | 1340 | 1.7% | 1.2% | 95% | 32 |
| C Regional schematic | 0 (0) | 2 / 2 | 0.229 / 0.785 | 0.867 | 1719 | 2.3% | 1.2% | 94% | 19 |
| D Equal-count stretch + collision | 0 (0) | 2 / 4 | 0.092 / 0.178 | 1.000 | 1272 | 2.5% | 1.2% | 92% | 34 |
| **E = D + personal space (chosen)** | 0 (0) | 1 / 3 | 0.104 / 0.193 | 0.999 | 1299 | 1.9% | 1.2% | 92% | 39 |

**Mobile, TOTAL 2024**

| Candidate | Overlap pairs (area px²) | Labels dropped, top 25 / 50 | Displacement mean / max | Order kept | Flow crossings | Flow length under circles | Circle cover of bbox | Bbox share of box | ms |
|---|---|---|---|---|---|---|---|---|---|
| Current (settle on map) | 122 (872) | 14 / 37 | 0.004 / 0.024 | 0.995 | 1542 | 30.0% | 11.4% | 32% | 15 |
| A1 Geo Dorling, pull 0.05 | 0 (0) | 10 / 31 | 0.009 / 0.069 | 0.982 | 1706 | 21.9% | 11.4% | 32% | 129 |
| A2 Geo Dorling, pull 0.15 | 0 (0) | 10 / 31 | 0.010 / 0.057 | 0.982 | 1665 | 23.0% | 11.5% | 32% | 105 |
| A3 Geo Dorling, pull 0.4 | 0 (0) | 10 / 31 | 0.010 / 0.053 | 0.983 | 1663 | 22.1% | 11.2% | 32% | 137 |
| B Size-weighted stretch + collision | 0 (0) | 2 / 12 | 0.244 / 0.555 | 1.000 | 1725 | 6.0% | 4.0% | 91% | 38 |
| C Regional schematic | 0 (0) | 2 / 12 | 0.380 / 0.869 | 0.862 | 2657 | 7.3% | 4.1% | 89% | 20 |
| D Equal-count stretch + collision | 0 (0) | 2 / 12 | 0.233 / 0.523 | 1.000 | 1658 | 6.9% | 4.2% | 87% | 39 |
| **E = D + personal space (chosen)** | 0 (0) | 2 / 13 | 0.250 / 0.528 | 0.999 | 1690 | 6.0% | 4.1% | 87% | 40 |

**Mobile, Li hydroxide 2024 (HS 2825.20)**

| Candidate | Overlap pairs (area px²) | Labels dropped, top 25 / 50 | Displacement mean / max | Order kept | Flow crossings | Flow length under circles | Circle cover of bbox | Bbox share of box | ms |
|---|---|---|---|---|---|---|---|---|---|
| Current (settle on map) | 7 (64) | 12 / 35 | 0.003 / 0.024 | 0.996 | 134 | 12.6% | 8.2% | 17% | 4 |
| A1 Geo Dorling, pull 0.05 | 0 (0) | 7 / 28 | 0.004 / 0.043 | 0.993 | 132 | 12.2% | 8.2% | 17% | 16 |
| A2 Geo Dorling, pull 0.15 | 0 (0) | 7 / 28 | 0.004 / 0.042 | 0.993 | 134 | 11.6% | 8.2% | 17% | 17 |
| A3 Geo Dorling, pull 0.4 | 0 (0) | 9 / 29 | 0.004 / 0.040 | 0.994 | 138 | 9.1% | 8.2% | 17% | 17 |
| B Size-weighted stretch + collision | 0 (0) | 2 / 8 | 0.304 / 0.580 | 1.000 | 206 | 1.0% | 1.5% | 90% | 11 |
| C Regional schematic | 0 (0) | 2 / 5 | 0.377 / 0.726 | 0.874 | 187 | 2.6% | 1.6% | 89% | 6 |
| D Equal-count stretch + collision | 0 (0) | 2 / 10 | 0.280 / 0.498 | 0.999 | 186 | 2.2% | 2.3% | 62% | 12 |
| **E = D + personal space (chosen)** | 0 (0) | 1 / 10 | 0.294 / 0.510 | 0.999 | 193 | 1.7% | 2.2% | 65% | 12 |

**Mobile, TOTAL 2000**

| Candidate | Overlap pairs (area px²) | Labels dropped, top 25 / 50 | Displacement mean / max | Order kept | Flow crossings | Flow length under circles | Circle cover of bbox | Bbox share of box | ms |
|---|---|---|---|---|---|---|---|---|---|
| Current (settle on map) | 53 (123) | 14 / 34 | 0.003 / 0.017 | 0.997 | 1033 | 16.6% | 5.8% | 32% | 13 |
| A1 Geo Dorling, pull 0.05 | 0 (0) | 8 / 26 | 0.005 / 0.024 | 0.991 | 1096 | 15.8% | 5.8% | 31% | 59 |
| A2 Geo Dorling, pull 0.15 | 0 (0) | 8 / 26 | 0.005 / 0.028 | 0.991 | 1018 | 14.0% | 5.8% | 31% | 60 |
| A3 Geo Dorling, pull 0.4 | 0 (0) | 8 / 26 | 0.005 / 0.025 | 0.992 | 1092 | 15.4% | 5.8% | 31% | 64 |
| B Size-weighted stretch + collision | 0 (0) | 4 / 12 | 0.248 / 0.555 | 1.000 | 1301 | 3.3% | 2.0% | 91% | 34 |
| C Regional schematic | 0 (0) | 4 / 12 | 0.380 / 0.852 | 0.857 | 1730 | 4.0% | 2.0% | 89% | 18 |
| D Equal-count stretch + collision | 0 (0) | 5 / 13 | 0.234 / 0.523 | 1.000 | 1270 | 3.7% | 2.1% | 86% | 35 |
| **E = D + personal space (chosen)** | 0 (0) | 4 / 12 | 0.251 / 0.528 | 1.000 | 1275 | 3.4% | 2.1% | 87% | 36 |

**Stability: TOTAL 2015–2024, mean (p95) movement of an economy between consecutive years, px**

| Candidate | Desktop | Phone |
|---|---|---|
| Current (settle on map) | 0.21 (1.2) | 0.39 (1.8) |
| A1 Geo Dorling, pull 0.05 | 0.51 (2.9) | 0.97 (4.6) |
| A2 Geo Dorling, pull 0.15 | 0.6 (3.4) | 1.05 (4.7) |
| A3 Geo Dorling, pull 0.4 | 0.58 (3.3) | 1.29 (6) |
| B Size-weighted stretch + collision | 1.33 (3.2) | 0.56 (1.3) |
| C Regional schematic | 4.25 (11.7) | 2 (6.5) |
| D Equal-count stretch + collision | 0.08 (0.6) | 0.06 (0.4) |
| E = D + personal space (chosen) | 0.23 (1.2) | 0.07 (0.5) |

## Why E

- **Flows are readable.** Flow length hidden under circles falls from 16% to 5% on desktop (30% to 6% on a phone).
  Intra-Europe and intra-Asia flows get room.
- **Labels fit.** Of the 25 largest economies, 1 label is dropped instead of 8; of the 50 largest, 3 instead of 25.
  Even with the new four-way placer, the current layout would still drop 4 and 15.
- **The canvas is used.** The layout fills 93% of the desktop box instead of 68%, and 87% of the phone box instead
  of 32%.
- **Geography is kept.** 99.8% of left/right and up/down pairs keep their order. On desktop, economies move about
  10% of the box width on average and at most 19%. On a phone it is 25%, because the tall box gets filled instead
  of leaving a world-shaped strip.
- **It is the steadiest.** Of the layouts without overlaps, E moves least through time: 0.23 px a year on desktop,
  0.07 px on a phone. Its stretch does not depend on the data.
- **The others fall short.** A (any strength) removes overlaps but leaves Europe and East Asia packed, with flows
  12–13% hidden on desktop and 20–23% on a phone. B is close to E on one picture but moves 6–8× more through
  time, because its stretch follows the year's sizes. C separates regions best for labels, but it scrambles geography
  (order kept 0.87, max displacement 0.76 of the width) and has the most flow crossings.
- **Personal space is what lets E beat D.** D packs circles edge to edge.
