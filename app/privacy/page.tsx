import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy — Risk Mapper",
  description:
    "What Risk Mapper does and does not collect. We anonymize IPs, store no cookies, and never see your matrix content.",
};

const LAST_UPDATED = "May 7, 2026";

const TRACKED_EVENTS: { name: string; description: string }[] = [
  { name: "pageview", description: "A visit to a page on this site." },
  {
    name: "share_matrix",
    description: "You created a cloud share link for a matrix.",
  },
  {
    name: "copy_worksheet",
    description:
      "You copied the matrix to the clipboard. Includes a `type` of `plain` (Markdown) or `rich` (HTML).",
  },
  {
    name: "download_pdf",
    description: "You downloaded the matrix as a PDF.",
  },
  {
    name: "first_pool_item",
    description: "You typed your first risk in the brainstorm pool.",
  },
  {
    name: "first_grid_item",
    description: "You added your first risk to the matrix grid.",
  },
  {
    name: "first_mitigation_typed",
    description: "You typed your first mitigation under any risk.",
  },
  {
    name: "first_mitigation_starred",
    description: "You starred your first mitigation.",
  },
  {
    name: "first_notes_content",
    description: "You typed something into the notes editor.",
  },
];

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 text-rm-ink sm:px-6 sm:py-14 lg:px-8">
      <Link
        href="/"
        className="text-sm text-rm-muted underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring"
      >
        &larr; Back to Risk Mapper
      </Link>

      <h1 className="mt-6 text-3xl font-semibold tracking-tight">Privacy</h1>
      <p className="mt-2 text-sm text-rm-muted-2">
        Last updated {LAST_UPDATED}
      </p>

      <p className="mt-6 leading-relaxed">
        Risk Mapper is built to collect as little as possible. We don&apos;t use
        cookies, we don&apos;t load third-party trackers, we never see the
        contents of your matrix, and we don&apos;t sell or share data with
        anyone.
      </p>

      <h2 className="mt-10 text-xl font-semibold">What we do not collect</h2>
      <ul className="mt-3 space-y-2 leading-relaxed">
        <li>
          <span aria-hidden>❌</span> No cookies. Your local matrices live in
          your browser&apos;s storage and never leave it unless you explicitly
          click <em>Share</em>.
        </li>
        <li>
          <span aria-hidden>❌</span> No third-party scripts. Nothing in your
          browser talks to anyone other than this site.
        </li>
        <li>
          <span aria-hidden>❌</span> No exact IP addresses. Your IP is
          anonymized on our server before any analytics event is recorded
          (see below).
        </li>
        <li>
          <span aria-hidden>❌</span> No matrix content. The text you type into
          risks, mitigations, or notes is never sent in any analytics payload.
          When you share a matrix, it is encrypted on your device first; the
          server only ever sees opaque ciphertext.
        </li>
        <li>
          <span aria-hidden>❌</span> We do not sell, rent, or share your data
          with any third party.
        </li>
      </ul>

      <h2 className="mt-10 text-xl font-semibold">What we do collect</h2>
      <p className="mt-3 leading-relaxed">
        We run a small, self-hosted analytics service to understand which
        parts of the tool are useful. Each event records the page URL,
        referrer, browser, operating system, screen size, language, and a
        coarse approximate location derived from the anonymized IP.
      </p>
      <p className="mt-3 leading-relaxed">
        These are the named events the app fires:
      </p>
      <ul className="mt-3 space-y-2 leading-relaxed">
        {TRACKED_EVENTS.map((e) => (
          <li key={e.name}>
            <code className="rounded bg-rm-surface-2 px-1.5 py-0.5 font-mono text-[0.85em] text-rm-ink">
              {e.name}
            </code>{" "}
            {e.description}
          </li>
        ))}
      </ul>
      <p className="mt-4 leading-relaxed">
        Events carry the name only. They do not carry the title of your
        matrix, the text of any risk or mitigation, or any other content
        you have typed. When you view a shared matrix, the unique
        identifier in the URL (the part after <code>/grid/</code>) is
        stripped before the page URL is reported.
      </p>

      <h2 className="mt-10 text-xl font-semibold">How we anonymize your IP</h2>
      <p className="mt-3 leading-relaxed">
        Your browser never talks to the analytics service directly. It posts
        each event to our own server, which strips most of the identifying
        bits from your IP address before forwarding it. We keep enough
        information to estimate which country or region the request came
        from, but not enough to identify you across visits, and the salt used
        for the remaining randomization rotates daily.
      </p>

      <h2 className="mt-10 text-xl font-semibold">Verify any of this</h2>
      <p className="mt-3 leading-relaxed">
        The entire site is open source. If you want to confirm any of the
        above, the code is at{" "}
        <a
          href="https://github.com/ActivistChecklist/riskmapper"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium underline underline-offset-2 hover:text-rm-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring"
        >
          github.com/ActivistChecklist/riskmapper
        </a>
        .
      </p>
    </main>
  );
}
