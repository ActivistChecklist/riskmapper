import type { ReactNode } from "react";
import { Prose } from "./Prose";

/**
 * The shell shared by the standalone documents (Privacy, Security): back
 * link, title, last-updated line, and the Markdown body.
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
