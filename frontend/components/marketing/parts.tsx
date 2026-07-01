"use client";

/**
 * Shared building blocks for the .jx marketing sub-pages. These mirror the
 * landing's vocabulary (forensic measurement markers, the carved display
 * header) so a sub-page is assembled from the same instrument parts, never a
 * generic dark-SaaS section.
 */

import type { ReactNode } from "react";

/* Forensic measurement-gridline marker — the structural signal that separates
   "measurement instrument" from "dark SaaS". Identical to the landing's. */
export function SectionMarker({ id, name, meta }: { id: string; name: string; meta?: string }) {
  return (
    <div className="jx-marker">
      <div className="jx-wrap jx-marker__row">
        <span className="jx-marker__id">[&nbsp;<b>{id}</b>&nbsp;]</span>
        <span className="jx-marker__name">{name}</span>
        {meta ? <span className="jx-marker__meta">{meta}</span> : null}
      </div>
    </div>
  );
}

/* Page header — the sub-page hero. Eyebrow + carved display title + lede + a
   mono meta line, framed by corner-tick viewport marks (the landing's hero
   chrome, reused). One calibrated radial lift, no glow blob. */
export function PageHeader({
  eyebrow,
  title,
  lede,
  meta,
  children,
}: {
  eyebrow: string;
  title: ReactNode;
  lede?: ReactNode;
  meta?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="jx-pagehead">
      <div className="jx-wrap jx-pagehead__wrap" data-reveal>
        <span className="jx-pagehead__chrome" aria-hidden>
          <span className="jx-hero__corner tl" /><span className="jx-hero__corner tr" />
          <span className="jx-hero__corner bl" /><span className="jx-hero__corner br" />
        </span>
        <span className="jx-eyebrow jx-pagehead__eyebrow"><span className="jx-tick" />{eyebrow}</span>
        <h1 className="jx-display jx-pagehead__title">{title}</h1>
        {lede ? <p className="jx-lede jx-pagehead__lede">{lede}</p> : null}
        {meta ? <div className="jx-pagehead__meta">{meta}</div> : null}
        {children ? <div className="jx-pagehead__extra">{children}</div> : null}
      </div>
    </header>
  );
}

/* Section head — eyebrow + carved title + optional lede (the landing's, shared). */
export function SectionHead({ eyebrow, title, lede }: { eyebrow: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <div className="jx-head" data-reveal>
      <span className="jx-eyebrow"><span className="jx-tick" />{eyebrow}</span>
      <h2 className="jx-display jx-h2 jx-head__title">{title}</h2>
      {lede ? <p className="jx-lede jx-head__lede">{lede}</p> : null}
    </div>
  );
}

/* Document layout — sticky mono table-of-contents + article column, used by the
   long-form content pages (Method / Extension / Privacy / Terms). */
export function DocShell({
  toc,
  aside,
  children,
}: {
  toc: { href: string; label: string }[];
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="jx-wrap jx-doc">
      <aside className="jx-doc__rail">
        <nav className="jx-doc__toc" aria-label="On this page">
          <span className="jx-label jx-doc__toc-label">On this page</span>
          {toc.map((t) => (
            <a key={t.href} href={t.href} className="jx-doc__toc-link">{t.label}</a>
          ))}
        </nav>
        {aside ? <div className="jx-doc__aside">{aside}</div> : null}
      </aside>
      <article className="jx-doc__article">{children}</article>
    </div>
  );
}

/* One article section: anchor + mono overline + carved title + body. */
export function DocSection({
  id,
  overline,
  title,
  children,
  tone,
}: {
  id: string;
  overline: string;
  title: ReactNode;
  children: ReactNode;
  tone?: "intro" | "limits";
}) {
  return (
    <section id={id} className={`jx-doc__section${tone ? ` is-${tone}` : ""}`} data-reveal>
      <span className="jx-doc__overline">{overline}</span>
      <h2 className="jx-display jx-doc__h2">{title}</h2>
      {children}
    </section>
  );
}
