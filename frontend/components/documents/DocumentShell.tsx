import type { ReactNode } from "react";
import DesignFooter from "../design/DesignFooter";
import DesignNav from "../design/DesignNav";

type DocumentShellProps = {
  children: ReactNode;
  title: string;
  summary: string;
  section: string;
  meta?: string;
  aside?: ReactNode;
};

export default function DocumentShell({
  children,
  title,
  summary,
  section,
  meta,
  aside,
}: DocumentShellProps) {
  return (
    <div className="jacobi-design document-page">
      <DesignNav />
      <main className="page" id="main-content">
        <section className="doc-hero section page-top">
          <div className="wrap doc-hero-grid">
            <div>
              <p className="doc-kicker">{section}</p>
              <h1 className="display doc-title">{title}</h1>
              <p className="doc-summary">{summary}</p>
              {meta ? <p className="doc-meta">{meta}</p> : null}
            </div>
            {aside ? <div className="doc-hero-aside">{aside}</div> : null}
          </div>
        </section>
        <section className="doc-body section">
          <div className="wrap doc-layout">{children}</div>
        </section>
      </main>
      <DesignFooter />
    </div>
  );
}

export function DocumentToc({ items }: { items: Array<{ href: string; label: string }> }) {
  return (
    <nav className="doc-toc" aria-label="On this page">
      <p className="doc-toc-label">On this page</p>
      <ol>
        {items.map((item) => (
          <li key={item.href}>
            <a href={item.href}>{item.label}</a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function DocumentArticle({ children }: { children: ReactNode }) {
  return <article className="doc-article">{children}</article>;
}
