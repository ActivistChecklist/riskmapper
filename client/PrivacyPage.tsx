import { DocPage } from "./DocPage";

/**
 * The privacy page body. Its title and description live in the head of
 * `privacy/index.html`, where `client/head.test.ts` asserts them.
 *
 * The prose is Markdown (see client/Prose.tsx). The one thing Markdown
 * cannot express here is the analytics event list, whose names are also the
 * strings `lib/analytics/events.ts` fires, so it stays a component.
 */

const LAST_UPDATED = "August 24, 2026";

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

function TrackedEvents() {
  return (
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
  );
}

export default function PrivacyPage() {
  return (
    <DocPage title="Privacy" lastUpdated={LAST_UPDATED}>
      {`
Risk Mapper is built to collect as little as possible. We don't use cookies,
we don't load third-party trackers, we never see the contents of your matrix,
and we don't sell or share data with anyone.

This page is about what we log when you visit. For how your matrices
themselves are protected, see [Security](/security/).

## What we do not collect

- ❌ **No cookies.** Your local matrices live in your browser's storage and never leave it unless you explicitly click *Share*.
- ❌ **No third-party scripts.** Nothing in your browser talks to anyone other than this site.
- ❌ **No exact IP addresses.** Your IP is anonymized on our server before any analytics event is recorded (see below).
- ❌ **No matrix content.** The text you type into risks, mitigations, or notes is never sent in any analytics payload. When you share a matrix, it is encrypted on your device first; the server only ever sees opaque ciphertext.
- ❌ **No data sales.** We do not sell, rent, or share your data with any third party.

## What we do collect

We run a small, self-hosted analytics service to understand which parts of
the tool are useful. Each event records the page URL, referrer, browser,
operating system, screen size, language, and a coarse approximate location
derived from the anonymized IP.

These are the named events the app fires:
`}

      <TrackedEvents />

      {`
Events carry the name only. They do not carry the title of your matrix, the
text of any risk or mitigation, or any other content you have typed. When you
view a shared matrix, the unique identifier in the URL (the part after
\`/grid/\`) is stripped before the page URL is reported.

## How we anonymize your IP

Your browser never talks to the analytics service directly. It posts each
event to our own server, which strips most of the identifying bits from your
IP address before forwarding it. We keep enough information to estimate which
country or region the request came from, but not enough to identify you
across visits, and the salt used for the remaining randomization rotates
daily.

## Verify any of this

The entire site is open source. If you want to confirm any of the above, the
code is at
[github.com/ActivistChecklist/riskmapper](https://github.com/ActivistChecklist/riskmapper).
`}
    </DocPage>
  );
}
