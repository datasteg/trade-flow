import type { ReactNode } from 'react';

// The small inline markup of the prose strings in lib/strings/method.ts and home.ts: **bold**, `code` (a code chip:
// HS codes, address keys) and [text](href). No nesting; anything else is plain text.
const TOKEN = /(\*\*[^*]+\*\*|`[^`]+`|\[[^\]]+\]\([^)\s]+\))/g;
const LINK = /^\[([^\]]+)\]\(([^)\s]+)\)$/;

export function rich(s: string): ReactNode[] {
  return s.split(TOKEN).filter(Boolean).map((part, i) => {
    if (part.length > 4 && part.startsWith('**') && part.endsWith('**')) return <strong key={i}>{part.slice(2, -2)}</strong>;
    if (part.length > 2 && part.startsWith('`') && part.endsWith('`')) return <code key={i} className="lr-hs">{part.slice(1, -1)}</code>;
    const link = LINK.exec(part);
    if (link) return <a key={i} href={link[2]}>{link[1]}</a>;
    return part;
  });
}

/** A paragraph of marked-up prose. */
export function P({ text, className }: { text: string; className?: string }) {
  return <p className={className}>{rich(text)}</p>;
}
