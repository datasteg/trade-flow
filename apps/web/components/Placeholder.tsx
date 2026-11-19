import type { ReactNode } from 'react';

/** A page that is still to be built: its h1 and one paragraph. `doc` sets the reading layout (serif headings),
 *  for chain, event, case and method pages. Delete with the last placeholder page. */
export function Placeholder({ title, children, doc }: { title: ReactNode; children: ReactNode; doc?: boolean }) {
  return (
    <div className={doc ? 'page page--doc' : 'page'}>
      <h1 className="page__title">{title}</h1>
      <p className="page__lede">{children}</p>
    </div>
  );
}
