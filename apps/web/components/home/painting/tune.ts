// The knobs of the home page's network painting (HeroNetworkPainting): what it draws, how many dabs, how fast it
// moves and in which colours. Shared by the server (data.ts picks the economies and flows and lays them out) and the
// browser (engine.ts paints them), so it holds plain values only.

export const TUNE = {
  /** The economies painted: the N largest by exports plus imports. */
  nodes: 48,
  /** Flows drawn as brushstrokes, the largest first: wide hero and narrow (phone) hero. */
  flows: 54,
  flowsNarrow: 20,
  /** Flows that pull partners together in the layout (more than are drawn, so the clusters form from real ties). */
  layoutFlows: 260,
  /** Hero width (CSS px) below which the narrow settings apply. */
  narrowBelow: 560,

  /** Dabs per economy: from `dabsMin` (the smallest economy) to `dabsMax` (the largest). Narrow: times `narrowDabs`. */
  dabsMin: 10,
  dabsMax: 60,
  narrowDabs: 0.6,
  /** Dab size, times the hero's scale (narrow: times `narrowSize`). */
  dabSize: 1,
  narrowSize: 0.78,
  /** The hard cap on dabs in the whole picture (clusters and strokes together). */
  maxDabs: 2800,
  /** A cluster's radius for the largest economy, as a share of the layout's height; others by √(trade). */
  clusterR: 0.13,
  /** Brushstroke width in px for the largest flow (others by value^0.6) and the floor. */
  strokeMax: 16,
  strokeMin: 2,
  /** How far a stroke bows to its right, as a share of its length (A→B and B→A part this way). */
  bow: 0.16,

  /** Painting in: clusters from 0 to `inClusters` s (largest first), strokes from `inStrokesFrom` to
   *  `inStrokesTo` s, each stroke drawn along its path in `inStrokeDraw` s; a dab fades in over `inDab` s. */
  inClusters: 1.25,
  inClusterSpread: 0.45,
  inStrokesFrom: 1.05,
  inStrokesTo: 2.15,
  inStrokeDraw: 0.45,
  inDab: 0.32,
  /** Shimmer: opacity swing (fraction) and drift (px), at 0.2–0.55 Hz. */
  shimmerAlpha: 0.08,
  shimmerDrift: 0.55,
  /** Glints of light along the strokes, exporter to importer: at most this many at once, a crossing taking from
   *  `glintSlow` s (the smallest flow drawn) to `glintFast` s (the largest). */
  glints: 6,
  glintsNarrow: 3,
  glintSlow: 6.5,
  glintFast: 2.6,
  /** Hover: what the rest of the picture fades to, and how long the fade takes (s). */
  dimTo: 0.3,
  focusFade: 0.3,
  /** Idle: every `idleEvery` s without interaction one notable flow is lit for `idleHold` s, with its caption. */
  idleEvery: 8,
  idleHold: 5,
  idleFlows: 10,
  /** Parallax on a fine pointer: the painting follows the cursor by up to this many px, the canvas ground the other way. */
  parallax: 3,

  /** Region colours as [hue, saturation %, lightness %]: low saturation, painterly. Ochre, warm brown, sage and
   *  terracotta from the site's earth palette; rose, cerulean, lavender and teal as the four accents. The keys are
   *  the region grouping's (groups/memberships.json). */
  regions: {
    EAS: [352, 38, 64],
    EUR: [206, 32, 56],
    NAM: [258, 22, 62],
    OCE: [176, 26, 47],
    LAC: [92, 24, 48],
    SSA: [38, 52, 54],
    MENA: [28, 36, 44],
    CSA: [16, 40, 54],
  } as Record<string, [number, number, number]>,
  /** An economy outside the regions. */
  other: [40, 12, 58] as [number, number, number],
  /** Per-dab jitter around the region colour: hue (degrees), saturation and lightness (points). */
  jitterHue: 12,
  jitterSat: 8,
  jitterLight: 11,
  /** Share of dabs that take a highlight (cream) or shadow (forest green) instead: broken colour. */
  highlights: 0.1,
  shadows: 0.06,
  /** Dark mode: lightness and saturation lift, so the dabs glow on the night water. */
  darkLift: 9,
  darkSat: 6,
} as const;

/** One of the region keys, or 'other'. */
export type RegionKey = string;
