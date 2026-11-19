import type { Metadata } from 'next';
import type { Meta } from '@larch/net/core';
import { TrailHead } from '@larch/ui';
import { Scenario, type ScenarioOption, type ScenarioProps, type ScenarioUse } from '@/components/stories/Scenario';
import { ToolForm, type ToolStageGroup } from '@/components/stories/ToolForm';
import { Book, periodLabel, sourceLine } from '@/components/stories/names';
import type { MetaLite } from '@/components/stories/types';
import { defaultStage, downStages, parseStage, productOf, snapTable, stageOptions, stageParam, TOOL_PATH, type StageOption } from '@/lib/cutSupplier';
import { readData } from '@/lib/data';
import { formatShare, t, type Lang } from '@/lib/i18n';
import { langOf } from '@/lib/page';
import { pageMeta } from '@/lib/seo';
import { stageLabel } from '@larch/ui';
import '../../stories.css';

// /cases/tools/cut-supplier?stage=<chain>/<key>&exporter=<ISO3>: the case studies' "Cut a supplier" scenario on any
// chain stage. Works from a bare URL with both parameters (other sites link here) and
// from the index with defaults; the selects write the query. Rendered per request (it reads the query).

type Params = Promise<{ lang: string }>;
type Search = Promise<Record<string, string | string[] | undefined>>;

async function load(lang: Lang, sp: Record<string, string | string[] | undefined>) {
  const [meta, { options, chains }] = await Promise.all([readData<Meta>('meta.json'), stageOptions()]);
  const stage = parseStage(sp.stage, options) ?? defaultStage(options);
  const year = meta.complete.A;
  const book = new Book(meta as unknown as MetaLite);
  const want = (Array.isArray(sp.exporter) ? sp.exporter[0] : sp.exporter ?? '').toUpperCase();
  const wantI = /^[A-Z0-9_]{3}$/.test(want) ? book.idx.get(want) ?? -1 : -1;
  const product = productOf(meta, stage);
  const table = product ? await snapTable(product, year, wantI >= 0 ? [wantI] : []) : null;
  const exporterI = table && wantI >= 0 && table.exporters.some(([i]) => i === wantI) ? wantI : table?.exporters[0]?.[0] ?? -1;
  return { meta, options, chains, stage, year, book, product, table, exporterI, lang };
}

function shortName(s: string): string {
  return s.length > 22 ? s.replace(/\s*\([^)]*\)\s*$/, '') : s;
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const [lang, sp] = await Promise.all([langOf(params), searchParams]);
  const x = await load(lang, sp);
  const stageName = lang === 'ko' ? x.stage.ko : x.stage.en;
  const exporter = x.exporterI >= 0 ? x.book.node(x.exporterI, lang) : '';
  return pageMeta(lang, {
    path: TOOL_PATH,
    title: `${t(lang, 'cases.tool.title')} · ${stageName}${exporter ? `, ${exporter}` : ''} (${x.year})`,
    description: t(lang, 'cases.tool.dek', { year: x.year }),
  });
}

export default async function CutSupplierTool({ params, searchParams }: { params: Params; searchParams: Search }) {
  const [lang, sp] = await Promise.all([langOf(params), searchParams]);
  const { meta, options, chains, stage, year, book, product, table, exporterI } = await load(lang, sp);
  const action = `/${lang}${TOOL_PATH}`;
  const name = (o: StageOption) => (lang === 'ko' ? o.ko : o.en);
  const chainName = (o: StageOption) => (lang === 'ko' ? o.chainKo : o.chainEn);
  const groups: ToolStageGroup[] = [];
  for (const o of options) {
    let g = groups.find((x) => x.chain === o.chain);
    if (!g) {
      g = { chain: o.chain, label: chainName(o), stages: [] };
      groups.push(g);
    }
    g.stages.push({ value: stageParam(o), label: `${stageLabel(lang, o.stage)} · ${name(o)}${o.chokepoint ? ` · ${t(lang, 'cases.tool.choke')}` : ''}` });
  }
  const exporters = (table?.exporters ?? []).map(([i, s]) => ({ iso: book.iso(i), label: `${book.node(i, lang)} · ${formatShare(s, lang, { decimals: s < 0.01 ? 1 : 0 })}` }));
  const stageName = name(stage);

  let scen: ScenarioProps | null = null;
  if (table && product && exporterI >= 0) {
    const chain = chains.find((c) => c.id === stage.chain)!;
    const st = chain.stages.find((s) => s.key === stage.key)!;
    const opt = (i: number): ScenarioOption => ({ key: book.iso(i), label: book.node(i, lang), members: [i] });
    const suppliers = [opt(exporterI), ...table.exporters.filter(([i]) => i !== exporterI).slice(0, 8).map(([i]) => opt(i))];
    const downList = downStages(chain, st, year);
    const down = (await Promise.all(downList.map(async (d) => {
      const dp = productOf(meta, { ...stage, id: d.product, key: d.key, stage: d.stage, en: d.en, ko: d.ko, role: d.role, chokepoint: false });
      const tb = dp ? await snapTable(dp, year) : null;
      if (!tb) return null;
      const u = st.use_share?.[chain.id];
      const use: ScenarioUse | null = u ? { share: u.share, what: u.what?.[lang] ?? undefined, source: u.source ?? undefined, year: u.year ?? null, url: u.url ?? null } : null;
      return { id: d.product, label: lang === 'ko' ? d.ko : d.en, table: tb, use, feedstock: st.role === 'feedstock' };
    }))).filter((d): d is NonNullable<typeof d> => !!d);
    const period = periodLabel(year, lang);
    scen = {
      lang,
      caseId: 'cut-supplier',
      kind: 'cut_supplier',
      names: book.nameList(lang),
      suppliers,
      cut: 1,
      products: [{ id: product.id, label: shortName(lang === 'ko' ? product.ko : product.en), table, base: true }],
      down,
      period,
      source: sourceLine(lang, { freq: 'A', rule: 'mirror', extra: t(lang, 'cases.scen.sourceExtra', { p: period }) }),
      intro: t(lang, 'cases.tool.intro', { exporter: book.node(exporterI, lang), stage: stageName, chain: chainName(stage), n: stage.stage }),
      note: t(lang, 'cases.tool.note'),
    };
  }

  return (
    <div className="page page--doc st-page" lang={lang}>
      <TrailHead kicker={t(lang, 'cases.tool.kicker')} title={t(lang, 'cases.tool.title')} dek={t(lang, 'cases.tool.dek', { year })}
        counts={[
          { value: options.length, label: t(lang, 'cases.tool.count.stages') },
          { value: lang === 'ko' ? `${year}년` : String(year), label: t(lang, 'cases.tool.count.year') },
          { value: exporters.length, label: t(lang, 'cases.tool.count.exporters') },
        ]} />
      <section className="st-sec" aria-labelledby="tool-h">
        <h2 id="tool-h">{`${chainName(stage)} · ${stageLabel(lang, stage.stage)} · ${stageName}`}</h2>
        <ToolForm lang={lang} action={action} stage={stageParam(stage)} groups={groups}
          exporter={exporterI >= 0 ? book.iso(exporterI) : ''} exporters={exporters} />
        {scen ? <Scenario key={`${stage.id}-${exporterI}`} {...scen} /> : <p className="lr-prose">{t(lang, 'cases.tool.nodata', { year })}</p>}
      </section>
      <nav className="st-pager" aria-label={t(lang, 'cases.related')}>
        <a href={`/${lang}/chains/${stage.chain}#stage-${stage.key}`}>{t(lang, 'cases.tool.back', { chain: chainName(stage) })}</a>
        <a href={`/${lang}/cases`}>{t(lang, 'cases.all')}</a>
      </nav>
    </div>
  );
}
