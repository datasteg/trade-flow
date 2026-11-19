'use client';
import { usePathname } from 'next/navigation';
import { Button } from '@larch/ui';
import { t } from '@/lib/i18n';

export default function NotFound() {
  const lang = usePathname()?.startsWith('/ko') ? 'ko' : 'en';
  return (
    <div className="page">
      <h1 className="page__title">{t(lang, 'common.notFound.title')}</h1>
      <p className="page__lede">{t(lang, 'common.notFound.body')}</p>
      <Button variant="secondary" href={`/${lang}`}>{t(lang, 'common.notFound.home')}</Button>
    </div>
  );
}
