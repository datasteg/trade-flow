import { isLang, type Lang } from './i18n';

/** The page's language from its params (the [lang] layout has already rejected anything else). */
export async function langOf(params: Promise<{ lang: string }>): Promise<Lang> {
  const { lang } = await params;
  return isLang(lang) ? lang : 'en';
}
