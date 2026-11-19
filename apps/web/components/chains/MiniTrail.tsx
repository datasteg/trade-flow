import { stageLabel, type Lang } from '@larch/ui';
import { stageVar } from './model';

/** The chain's ladder as diamonds on a path, for the chain cards: one per rung, filled in the rung's colour where
 *  the chain has a product of its own there, hollow where it has none (feedstocks only), the chokepoint ringed in
 *  rowan. Each carries its S-number. */
export function MiniTrail({ lang, present, choke }: { lang: Lang; present: boolean[]; choke: number | null }) {
  const n = present.length;
  return (
    <ol className="ch-mini" aria-hidden style={{ ['--levels' as string]: n }}>
      {present.map((on, i) => (
        <li key={i} className={[on ? '' : 'is-empty', choke === i + 1 ? 'is-choke' : ''].filter(Boolean).join(' ') || undefined}
          style={{ ['--stage' as string]: stageVar(i + 1, n) }}>
          <i />
          <span>{stageLabel(lang, i + 1)}</span>
        </li>
      ))}
    </ol>
  );
}
