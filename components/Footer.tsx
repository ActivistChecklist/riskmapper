const GITHUB_URL = "https://github.com/ActivistChecklist/riskmapper";
const ACTIVIST_CHECKLIST_URL = "https://activistchecklist.org/";

function GithubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden
      className={className}
    >
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.1.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.87-1.54-3.87-1.54-.52-1.33-1.28-1.69-1.28-1.69-1.04-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.04 0 0 .96-.31 3.16 1.18a10.97 10.97 0 0 1 5.76 0c2.2-1.49 3.16-1.18 3.16-1.18.62 1.58.23 2.75.11 3.04.74.81 1.18 1.84 1.18 3.1 0 4.42-2.69 5.4-5.25 5.68.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.67.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function Footer() {
  return (
    <footer className="border-t border-rm-border bg-rm-canvas">
      <div className="mx-auto flex w-full max-w-[1320px] flex-col items-center gap-3 px-4 py-5 text-sm text-rm-muted sm:flex-row sm:justify-between sm:px-6 sm:py-4 lg:px-8">
        <p>
          Created by{" "}
          <a
            href={ACTIVIST_CHECKLIST_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-rm-ink underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring"
          >
            Activist Checklist
          </a>
        </p>
        <nav
          aria-label="Site"
          className="flex items-center gap-5"
        >
          {/* A plain anchor, not a router link: the privacy page is its own
              static document. The trailing slash is canonical and load-bearing
              — see MIGRATION.md decisions D2 and D7. */}
          <a
            href="/privacy/"
            className="hover:text-rm-ink hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring"
          >
            Privacy
          </a>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 hover:text-rm-ink hover:underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring"
            aria-label="Source on GitHub"
          >
            <GithubIcon className="size-4" />
            GitHub
          </a>
        </nav>
      </div>
    </footer>
  );
}
