import { stageVar } from '@larch/net/core';
import { t, type Lang } from '@/lib/i18n';
import type { ChainBlock } from './data';

/** The chain's ladder as a row of bricks: one per rung in the rung's colour (the stage ramp spread over the ladder),
 *  hollow where the chain has no product of its own on the rung (feedstocks only), the chokepoint ringed in rowan.
 *  The words are in the aria label. */
function Ladder({ lang, b }: { lang: Lang; b: ChainBlock }) {
  const n = b.present.length;
  const label = [
    t(lang, 'home.chains.ladder', { n, names: b.levelNames.join(', ') }),
    b.chokeName ? t(lang, 'home.chains.choke', { name: b.chokeName }) : null,
  ].filter(Boolean).join('. ');
  return (
    <span className="hm-ladder" role="img" aria-label={label} style={{ ['--levels' as string]: n }}>
      {b.present.map((on, i) => (
        <i key={i} className={[on ? '' : 'is-empty', b.chokeLevel === i + 1 ? 'is-choke' : ''].filter(Boolean).join(' ') || undefined}
          style={{ ['--stage' as string]: stageVar(i + 1, n) }} />
      ))}
    </span>
  );
}

/** The ten chains as blocks, each a link to its chain page: the ladder, the number of stages, the name and the
 *  editor's finding. */
export function ChainBlocks({ lang, blocks }: { lang: Lang; blocks: ChainBlock[] }) {
  return (
    <ul className="hm-blocks">
      {blocks.map((b) => (
        <li key={b.id}>
          <a className="hm-block" href={b.href}>
            <Ladder lang={lang} b={b} />
            <span className="lr-kicker hm-block__kicker">{t(lang, 'home.chains.stages', { n: b.present.length, k: b.stages })}</span>
            <h3 className="hm-block__name">{b.name}</h3>
            {b.finding ? <span className="hm-block__finding">{b.finding}</span> : null}
          </a>
        </li>
      ))}
    </ul>
  );
}
