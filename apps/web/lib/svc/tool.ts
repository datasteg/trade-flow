// The "Cut a supplier" tool (/[lang]/cases/tools/cut-supplier?stage=<chain>/<key>&exporter=<ISO3>): the same tables
// (lib/cutSupplier.ts snapTable) and the same first-round arithmetic (components/stories/scenario.ts) as the page,
// with the page's defaults (the stage's largest exporter, a full cut, the use share's default). Shares only.
import { HHI_HIGH } from '@/components/chains/model';
import { downListed, otherExporters, passDown, ranked, runCut, SMALLER, worldCut } from '@/components/stories/scenario';
import { defaultStage, downStages, parseStage, productOf as stageProduct, snapTable, stageOptions, stageParam, TOOL_PATH } from '@/lib/cutSupplier';
import { badParam, econIndex, econRef, enName, envelope, getMeta, pageOf, pct, pctText, ratio, sourcesFor, unknownId, type Envelope, type Lang } from './core';

const RANKED = 12; // the page's table
const DOWN_LISTED = 8;

export interface CutArgs { stage: string | null; exporter: string | null; cut: string | null; lang: Lang }

export async function supplierCutView(o: CutArgs): Promise<Envelope> {
  const meta = await getMeta();
  const { options, chains } = await stageOptions();
  const stage = o.stage ? parseStage(o.stage, options) : defaultStage(options);
  if (!stage) {
    throw unknownId('unknown-stage', 'Unknown chain stage',
      `${o.stage!.slice(0, 60)} is not a chain stage. Write it <chain>/<stage>, such as semiconductors/ics or batteries/li_hydroxide; GET /v1/trade-flow/chains/{chain} lists a chain's stages.`);
  }
  let cut = 1;
  if (o.cut != null) {
    const c = Number(o.cut);
    if (!Number.isInteger(c) || c < 1 || c > 100) throw badParam(`cut is the share of the exporter's supply removed, a whole percentage from 1 to 100; got "${o.cut}".`);
    cut = c / 100;
  }
  const year = meta.complete.A;
  const wantI = o.exporter ? econIndex(meta, o.exporter, 'exporter') : -1;
  const product = stageProduct(meta, stage);
  const table = product ? await snapTable(product, year, wantI >= 0 ? [wantI] : []) : null;
  if (!table || !table.exporters.length) throw new Error(`no ${year} table for ${stage.id}`);
  if (wantI >= 0 && !table.exporters.some(([i]) => i === wantI)) {
    throw badParam(`${meta.nodes[wantI].id} exported no ${stage.en.toLowerCase()} in ${year}. The largest exporters were ${table.exporters.slice(0, 5).map(([i]) => meta.nodes[i].id).join(', ')}.`);
  }
  const ex = wantI >= 0 ? wantI : table.exporters[0][0];
  const lang = o.lang;
  const shocked = [ex];
  const rows = runCut(table, shocked, cut);
  const top = ranked(rows, RANKED, -1);
  const exposure = new Map(rows.map((r) => [r.i, r.risk]));
  for (const imp of table.importers) if (!exposure.has(imp.i)) exposure.set(imp.i, 0);

  const chain = chains.find((c) => c.id === stage.chain)!;
  const st = chain.stages.find((s) => s.key === stage.key)!;
  const down = [];
  for (const d of downStages(chain, st, year)) {
    const dp = stageProduct(meta, { ...stage, id: d.product, key: d.key, stage: d.stage, en: d.en, ko: d.ko, role: d.role, chokepoint: false });
    const tb = dp ? await snapTable(dp, year) : null;
    if (!tb) continue;
    const u = st.use_share?.[chain.id];
    const unknown = u != null && u.share == null;
    const use = u?.share != null ? u.share : 1;
    const res = unknown ? null : passDown(tb, exposure, use);
    const sum = res ? downListed(res.rows, DOWN_LISTED, -1) : null;
    down.push({
      stage: d.key, product: d.product, name: lang === 'ko' ? d.ko : d.en,
      use_share_pct: u?.share != null ? pct(u.share) : null, use_share_source: u?.source ?? null,
      use_share_assumed: u == null ? 'none: the whole shortfall passes (an upper bound)' : null,
      world_exports_at_risk_pct: sum ? pct(sum.total) : null, exporters_hit: sum ? sum.count : null,
      exporters: sum ? sum.listed.map((r) => ({ ...econRef(meta, r.j, lang), share_of_world_exports_pct: pct(r.x), exposure_pct: pct(r.e), at_risk_pct: pct(r.passed) })) : [],
    });
  }

  const importers = top.map((r) => ({
    ...econRef(meta, r.i, lang), share_of_world_imports_pct: pct(r.world), from_exporter_pct: pct(r.fromShocked), at_risk_pct: pct(r.risk),
    world_gap_pct: pct(r.worldGap), other_suppliers_pct: pct(r.others), others_must_ship_more_pct: pct(r.need), filed: r.filed,
    fill: r.fill.filter((f) => f.take > 0).sort((a, b) => b.take - a.take).slice(0, 3)
      .map((f) => (f.i === SMALLER ? { code: null, name: 'smaller suppliers', takes_pct: pct(f.take) } : { ...econRef(meta, f.i, lang), takes_pct: pct(f.take) })),
  }));
  const share = table.exporters.find(([i]) => i === ex)?.[1] ?? 0;
  const others = otherExporters(table, shocked, 5).map(([i, s]) => ({ ...econRef(meta, i, lang), share_of_world_exports_pct: pct(s) }));
  const over = rows.filter((r) => r.risk > 0.25).length;
  const hhi = st.years[String(year)]?.hhi ?? null;
  const eName = enName(meta, ex);
  const lead = importers.slice(0, 3).map((r) => `${enName(meta, econIndex(meta, r.code!))} ${r.at_risk_pct}%`).join(', ');
  const summary = `Cutting ${/s$/.test(eName) ? `${eName}’` : `${eName}’s`} ${stage.en.toLowerCase()} exports (${stage.chainEn} chain, rung ${stage.stage}) by ${Math.round(cut * 100)}% in ${year} removes ${pctText(worldCut(table, shocked, cut))} of world exports (${eName} held ${pctText(share)}). `
    + `Most exposed importers, share of imports at risk: ${lead || 'none'}; ${over} importer${over === 1 ? '' : 's'} above 25%. `
    + (down[0]?.world_exports_at_risk_pct != null ? `One stage down, ${pctText((down[0].world_exports_at_risk_pct ?? 0) / 100)} of world ${down[0].name.toLowerCase()} exports is exposed. ` : '')
    + 'First-round arithmetic on UN Comtrade trade shares, not a forecast.';
  const { sources, notes } = sourcesFor(meta, 'A');
  notes.push('First round only: an importer loses its share from the cut exporter times the cut; its other suppliers fill the gap in proportion to their shares; one stage down an exporter loses its share of world exports times its exposure upstream times the use share. No stocks, no new suppliers, no prices.');
  notes.push(`Importers: the 40 largest of the stage, each with its suppliers of at least 0.5% (the twelve largest); the rest are "smaller suppliers". Table: the ${RANKED} most exposed.`);
  const q = new URLSearchParams({ stage: stageParam(stage), exporter: meta.nodes[ex].id });
  if (cut !== 1) q.set('cut', String(Math.round(cut * 100)));
  return envelope(meta, 'supplier_cut', {
    period: { freq: 'A', shown: String(year), complete_a: meta.complete.A },
    page: pageOf(lang, `${TOOL_PATH}?stage=${stageParam(stage)}&exporter=${meta.nodes[ex].id}`),
    sources, notes, summary,
    data: {
      year, cut_pct: Math.round(cut * 100),
      stage: { chain: stage.chain, key: stage.key, id: stage.id, rung: stage.stage, name: lang === 'ko' ? stage.ko : stage.en, chain_name: lang === 'ko' ? stage.chainKo : stage.chainEn, exporter_hhi: ratio(hhi), chokepoint: hhi != null && hhi > HHI_HIGH },
      exporter: { ...econRef(meta, ex, lang), share_of_world_exports_pct: pct(share) },
      world_exports_removed_pct: pct(worldCut(table, shocked, cut)),
      importers_over_25_pct: over,
      importers, other_exporters: others, one_stage_down: down,
    },
    table: {
      columns: [
        { id: 'code', label: 'Importer (ISO3)' }, { id: 'name', label: 'Importer' }, { id: 'share_of_world_imports_pct', label: 'Share of world imports', unit: '%' },
        { id: 'from_exporter_pct', label: `Share of its imports from ${meta.nodes[ex].id}`, unit: '%' }, { id: 'at_risk_pct', label: 'Share of its imports at risk', unit: '%' },
        { id: 'others_must_ship_more_pct', label: 'Other suppliers must ship more by', unit: '%' },
      ],
      rows: importers.map((r) => [r.code, r.name, r.share_of_world_imports_pct, r.from_exporter_pct, r.at_risk_pct, r.others_must_ship_more_pct]),
    },
  });
}
