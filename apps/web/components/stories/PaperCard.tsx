// One paper on a case page: authors, year, series and number, title, the finding with the verbatim quote in
// quotation marks, the date and the link. On Korean pages the finding is the Korean paraphrase from the config and
// the quote follows in the original English. The jejualps id (`ref`) stays in the source file.
import { ExternalLink } from 'lucide-react';
import { formatDate, t, type Lang } from '@/lib/i18n';
import type { FurtherReading, Paper } from './types';

function seriesLine(p: { series: string; number: string | null }): string {
  return p.number ? `${p.series} ${p.number}` : p.series;
}

export function PaperCard({ paper: p, lang }: { paper: Paper; lang: Lang }) {
  const quotes = Array.isArray(p.quote) ? p.quote : [p.quote];
  return (
    <article className="st-paper">
      <p className="st-paper__meta">
        <span className="st-paper__series">{seriesLine(p)}</span>
        <span> · </span>
        <time dateTime={p.date}>{formatDate(p.date, lang)}</time>
      </p>
      <h3 className="st-paper__title">
        <a href={p.url} rel="noopener noreferrer" target="_blank" lang="en">{p.title}</a>
      </h3>
      <p className="st-paper__authors" lang="en">{p.authors} ({p.year})</p>
      <p className="st-paper__finding">{p.finding[lang] ?? p.finding.en}</p>
      {lang === 'ko' ? (
        <blockquote className="st-paper__quote" lang="en">
          <span className="st-paper__qlabel" lang="ko">{t(lang, 'cases.paper.original')}</span>
          {quotes.map((q, i) => <p key={i}>“{q}”</p>)}
        </blockquote>
      ) : null}
      <p className="st-paper__foot">
        {p.verified ? <span className="st-paper__checked">{t(lang, 'cases.paper.checked')}</span> : null}
        <a className="st-paper__link" href={p.url} rel="noopener noreferrer" target="_blank">
          {t(lang, 'cases.paper.read')} <ExternalLink aria-hidden size={14} strokeWidth={1.5} />
        </a>
      </p>
    </article>
  );
}

export function ReadingItem({ r, lang }: { r: FurtherReading; lang: Lang }) {
  return (
    <li className="st-reading__item">
      <span lang="en">{r.authors} ({r.year}), </span>
      <a href={r.url} rel="noopener noreferrer" target="_blank" lang="en">{r.title}</a>
      <span className="lr-caption"> · <span lang="en">{seriesLine(r)}</span>, {formatDate(r.date, lang)}</span>
    </li>
  );
}
