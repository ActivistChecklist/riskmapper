import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OFFLINE_CHECKSUM_PATH, OFFLINE_DOWNLOAD_PATH } from "@/lib/offlinePaths.mts";
import { builtOnLabel } from "@/lib/releaseDate";
import { DocPage } from "./DocPage";

/**
 * The offline download page: where to get the single-file copy, how to check
 * one, and how it differs from the website. Its title and description live
 * in the head of `offline/index.html`, where `client/head.test.ts` asserts
 * them.
 *
 * The offline file's update notice and the site footer both link here (see
 * OFFLINE_PAGE_PATH). The Security page keeps a short section pointing here,
 * under the heading older offline copies still link to.
 */

const LAST_UPDATED = "November 24, 2026";

/**
 * The build date of the copy this site is serving, with the download, near
 * the top of the page. Someone holding an offline copy can compare this date
 * with the one in their copy's footer and update notice. Both come from
 * release.json; see lib/releaseDate.ts.
 */
function LatestOfflineCopy() {
  return (
    <section
      aria-labelledby="latest-offline-copy"
      className="mt-6 rounded-lg border border-l-4 border-rm-border-strong border-l-rm-primary bg-rm-surface-2 p-4 sm:p-5"
    >
      <h2 id="latest-offline-copy" className="text-base font-semibold text-rm-ink">
        Latest offline copy: built {builtOnLabel()}
      </h2>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-3">
        {/* An anchor styled as a button: it fetches a file, which is what a
            link does, and the server sends it as an attachment. */}
        <Button asChild variant="primary" size="lg">
          <a href={OFFLINE_DOWNLOAD_PATH} download>
            <Download className="size-5" aria-hidden />
            Download the offline copy
          </a>
        </Button>
        <a
          href={OFFLINE_CHECKSUM_PATH}
          className="text-sm font-medium text-rm-ink underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rm-ring"
        >
          Its SHA-256 fingerprint
        </a>
      </div>
      <p className="mt-4 text-sm leading-relaxed text-rm-muted">
        If you already have a copy, it shows the date it was built at the
        bottom of the page. If that date is earlier than this one, download a
        new copy.
      </p>
    </section>
  );
}

export default function OfflinePage() {
  return (
    <DocPage title="Use Risk Mapper offline" lastUpdated={LAST_UPDATED}>
      {`
Download the offline copy if you need Risk Mapper on a computer with no
internet, or would rather your browser never contacted our server again. It
is the same app in a single HTML file: save it, then open it in your browser.
It never connects to the internet on its own, because the file tells your
browser to block every network request. Links in it, such as the ones to our
Security and Privacy pages, open the website only if you click them.
`}
      <LatestOfflineCopy />
      {`
## Check a copy someone gave you

**Only trust a copy you downloaded from riskmapper.app yourself, or one you
have checked.** The file's protections live inside the file, so anyone who
edits a copy can remove them, and an edited copy looks exactly the same. To
check a copy someone gave you, compare its fingerprint with
[the one we publish](${OFFLINE_CHECKSUM_PATH}). On a Mac or Linux, run
\`shasum -a 256 riskmapper-offline.html\` in a terminal. On Windows, run
\`Get-FileHash riskmapper-offline.html\` in PowerShell. The long code it
prints must match ours, ignoring capital letters. A copy of an older version
will not match either, so download a fresh one.

## How it differs from the website

- Share by link is not available, because it needs our server. Exporting and importing files work the same way.
- Your work is saved in your browser for that file. In some browsers, moving or renaming the file, or opening a newer copy, starts you over with an empty matrix, while the old work stays in the browser until you delete it in the old copy. Use **Export → RiskMapper.app export format** to move your work into a newer copy, then delete it from the old one.
- In Chrome, Edge, Brave and other Chromium-based browsers, any HTML file you open from your computer can read or change your saved work. Firefox keeps each file's storage separate, so it is the safer choice for the offline copy.
- The offline copy does not update itself, so it does not get security fixes. Download it again from this page to get a newer version.
- WEBCAT only checks pages our server sends, so it does not check the offline copy. The [Security page](/security/) explains what WEBCAT does.
`}
    </DocPage>
  );
}
