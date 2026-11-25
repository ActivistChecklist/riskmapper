import { useEffect, type ReactNode } from "react";
import { Prose } from "./Prose";

/**
 * Scrolls to the element the URL's fragment names, once the page has
 * rendered. The browser tries this itself on load, but these pages render
 * their headings from JavaScript after that attempt, so a link like
 * /security/#use-risk-mapper-with-no-internet would otherwise land at the
 * top. Heading ids come from `headingId` in client/Prose.tsx and are plain
 * ASCII, so the fragment needs no decoding. Exported for tests.
 */
export function scrollToFragment(hash: string): void {
  const id = hash.replace(/^#/, "");
  if (!id) return;
  document.getElementById(id)?.scrollIntoView();
}

/**
 * The shell shared by the standalone documents (Privacy, Security,
 * Offline): back link, title, last-updated line, and the Markdown body.
 *
 * Each of these is its own static HTML entry rather than a client route, so
 * a reader can land on one without downloading the app. See MIGRATION.md D2.
 */
export function DocPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated: string;
  children: ReactNode;
}) {
  // Once, on mount: in-page links after that are ordinary same-document
  // navigation, which the browser scrolls for on its own.
  useEffect(() => {
    scrollToFragment(window.location.hash);
  }, []);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 text-rm-ink sm:px-6 sm:py-14 lg:px-8">
      <a
        href="/"
        className="text-sm text-rm-muted underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring"
      >
        &larr; Back to Risk Mapper
      </a>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-rm-muted-2">Last updated {lastUpdated}</p>

      <div className="mt-6">
        <Prose>{children}</Prose>
      </div>
    </main>
  );
}
