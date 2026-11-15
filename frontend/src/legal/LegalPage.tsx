import { Children, isValidElement, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { PageTransition } from '../components/PageTransition';
import { BrandMark } from '../components/BrandMark';
import { LEGAL_ENTITY, LEGAL_LAST_UPDATED } from './entity';

/**
 * Shared chrome for the two public legal pages (Privacy, Terms).
 *
 * These are pre-rendered and indexed, so they are product surface rather than
 * boilerplate, and they are styled with the app's Modern Confident tokens
 * (canvas / ink / muted / line, serif `font-display` headings) instead of the
 * off-system warm greys they used to carry.
 *
 * The contents nav is derived from the <Section> children rather than being
 * maintained by hand, so it can never fall out of step with the sections
 * actually on the page. Section ids come from the same slug() both here and in
 * Section, which is what makes the jump links line up.
 *
 * Pre-render safe: pure render, no window/document access.
 */

/** "1. Who we are" -> { num: '1', text: 'Who we are' } */
function splitHeading(title: string): { num: string | null; text: string } {
  const m = /^(\d+)\.\s+(.*)$/.exec(title);
  return m ? { num: m[1] ?? null, text: m[2] ?? title } : { num: null, text: title };
}

function slug(title: string): string {
  return splitHeading(title)
    .text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export function LegalPage({
  title,
  summary,
  otherDoc,
  children,
}: {
  title: string;
  /** One line under the H1 saying what this document is for, in plain English. */
  summary: string;
  otherDoc: { to: string; label: string };
  children: ReactNode;
}) {
  const headings = Children.toArray(children)
    .filter(isValidElement)
    .map((child) => (child.props as { title?: string }).title)
    .filter((t): t is string => typeof t === 'string' && t.length > 0);

  return (
    <PageTransition>
      <div className="min-h-screen bg-canvas">
        <div className="mx-auto max-w-3xl px-6 py-12 md:py-16">
          <Link to="/" aria-label="Benchbook home" className="inline-flex print:hidden">
            <BrandMark />
          </Link>

          <header className="mt-10 border-b border-line pb-8">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">
              Legal
            </p>
            <h1 className="mt-3 font-display text-4xl leading-tight text-ink md:text-5xl">
              {title}
            </h1>
            <p className="mt-4 max-w-xl text-[15px] leading-relaxed text-muted">{summary}</p>
            <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted">
              <span className="inline-flex items-center rounded-full border border-line bg-white px-3 py-1 text-xs font-medium text-ink">
                Effective {LEGAL_LAST_UPDATED}
              </span>
              <span aria-hidden className="text-line">
                |
              </span>
              <Link
                to={otherDoc.to}
                className="font-medium text-primary underline-offset-4 hover:underline print:hidden"
              >
                {otherDoc.label}
              </Link>
            </div>
          </header>

          {headings.length > 0 && (
            <nav
              aria-label="Contents"
              className="mt-10 rounded-card border border-line bg-white p-6 print:hidden"
            >
              <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Contents
              </h2>
              <ol className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
                {headings.map((h) => {
                  const { num, text } = splitHeading(h);
                  return (
                    <li key={h} className="text-[15px] leading-snug">
                      <a
                        href={`#${slug(h)}`}
                        className="group inline-flex gap-2 text-ink hover:text-primary"
                      >
                        {num && (
                          <span className="w-4 shrink-0 tabular-nums text-muted group-hover:text-primary">
                            {num}
                          </span>
                        )}
                        <span className="underline-offset-4 group-hover:underline">{text}</span>
                      </a>
                    </li>
                  );
                })}
              </ol>
            </nav>
          )}

          <div className="mt-12 space-y-10">{children}</div>

          <footer className="mt-16 border-t border-line pt-6 text-sm text-muted">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <span>© 2026 {LEGAL_ENTITY}</span>
              <div className="flex flex-wrap gap-x-4 gap-y-1 print:hidden">
                <Link to={otherDoc.to} className="font-medium text-primary hover:underline">
                  {otherDoc.label}
                </Link>
                <Link to="/about" className="font-medium text-primary hover:underline">
                  Our story
                </Link>
                <Link to="/" className="font-medium text-primary hover:underline">
                  Back to Benchbook
                </Link>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </PageTransition>
  );
}

/**
 * One clause. `title` doubles as the contents-nav label and, via slug(), as the
 * anchor id — so renaming a heading moves its deep link. That is intentional:
 * a stale link to a renamed clause is worse than a broken one.
 */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  const { num, text } = splitHeading(title);
  return (
    <section id={slug(title)} className="scroll-mt-8">
      <h2 className="flex gap-3 font-display text-2xl leading-snug text-ink">
        {num && (
          <span className="mt-1 w-7 shrink-0 text-base tabular-nums text-primary">{num}</span>
        )}
        <span>{text}</span>
      </h2>
      <div className="mt-3 space-y-3 text-[15px] leading-7 text-ink/85 sm:pl-10 [&_li]:leading-7 [&_strong]:font-semibold [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/** Inline mailto for the contact clauses. */
export function MailLink({ email }: { email: string }) {
  return (
    <a
      className="font-medium text-primary underline-offset-4 hover:underline"
      href={`mailto:${email}`}
    >
      {email}
    </a>
  );
}
