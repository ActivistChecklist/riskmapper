import { RETENTION_DAYS } from "@/components/risk-matrix/cloudConfig";
import { DocPage } from "./DocPage";

/**
 * The security page body. Its title and description live in the head of
 * `security/index.html`, where `client/head.test.ts` asserts them.
 *
 * Prose is Markdown (see client/Prose.tsx). Values that have to stay true
 * as the code changes are interpolated rather than typed out: the retention
 * window here is the same constant the share dialog quotes.
 *
 * The long-form version of the same material, aimed at someone who wants
 * the reasoning rather than the summary, is THREAT-MODEL.md. Keep the two
 * in step.
 */

const LAST_UPDATED = "August 24, 2026";

const REPO_URL = "https://github.com/ActivistChecklist/riskmapper";
const THREAT_MODEL_URL = `${REPO_URL}/blob/main/THREAT-MODEL.md`;
const WEBCAT_URL = "https://github.com/freedomofpress/webcat";

export default function SecurityPage() {
  return (
    <DocPage title="Security" lastUpdated={LAST_UPDATED}>
      {`
The safest thing we can do with your planning is never to have it. By default,
nothing you type into Risk Mapper leaves your device. If you decide to share a
matrix by link, it is encrypted in your browser first, and all we ever hold is
scrambled data we cannot read.

Here is exactly how that works, and where it stops working.

## Your matrix stays in your browser by default

Everything you type is saved in your browser's storage on this device. There
are no accounts, no logins, and no email addresses, and there is nothing to
sign up for. Nothing reaches our servers unless you turn on sharing yourself.

Two things follow from that:

- Clearing your browser data deletes your matrices, and we have no copy to restore. If a matrix matters, export it.
- Exports are local too. Copying the worksheet and downloading the PDF both happen entirely in your browser.

## Share by link is the only thing we ever receive

Turning on **Share by link** is the one action that sends any part of your
matrix to our servers, and by the time it arrives it is already encrypted.
Your browser generates a random 256-bit key, encrypts the matrix with
XChaCha20-Poly1305, and uploads only the result. The key lives in the part of
the link after the \`#\`, which browsers never send to a server. We never see
it, so we cannot decrypt your matrix, hand it over, or lose it in a breach.

Encrypted on your device before it leaves:

- ✅ The title of the matrix
- ✅ Every risk and every category you sort them into
- ✅ Every mitigation, including which ones you starred
- ✅ Everything in the notes editor

What we hold on the server:

- The encrypted blob, which we cannot read
- The random id from the link
- Coarse dates: the day the matrix was created, and the day it was last edited or opened, rounded to the calendar day in UTC
- A counter per edit, plus a random per-browser label, so edits from two devices can be merged

We keep those dates for one reason: a shared matrix is deleted automatically
after ${RETENTION_DAYS} days with no activity. **Stop sharing** deletes the
server copy immediately, for everyone.

## Keep the link safe

The link is the password. There is no separate login and no view-only
version, so anyone who has the full link can read, edit, or delete the shared
copy. Anywhere the link goes, the matrix goes with it.

- Your browser history is the most common leak. Anyone with access to your computer, or to your unlocked browser, can find the link there.
- Chrome syncs history to your Google account, where it can be reached by a subpoena. Firefox, Brave, Edge, and Safari all sync too if you turn it on.
- Screenshots, screen sharing, smart clipboards, and link previews in chat apps have all leaked URLs before.

What we suggest:

- Send the link through Signal, not email or SMS.
- For higher-risk work, use [Tor Browser](https://www.torproject.org/download/), which keeps no history between sessions and hides your IP address from us.
- Avoid Google Chrome for anything sensitive, especially if you are signed into a Google account.
- Use **Stop sharing** when you are done with a link.

## The code you run is signed

Every tool that encrypts in your browser has the same weak point: you have to
trust that the JavaScript you were served is the JavaScript we wrote. Whoever
controls the hosting could ship a version that quietly copies your key before
it encrypts anything, and you would not be able to tell by looking.

Risk Mapper is enrolled in [WEBCAT](${WEBCAT_URL}), a code-signing system
from Freedom of the Press Foundation. With the WEBCAT browser extension
installed, your browser checks every file this site serves against a
signature recorded in a public transparency log before it runs any of it. If
what arrives does not match what we signed, the extension blocks the page
instead of running it, and the mismatch is visible to anyone watching the log
rather than only to the person being attacked.

The signing key is a hardware token. It never leaves that token, our build
pipeline cannot sign anything on its own, and every release takes a person
entering a PIN and physically tapping the key. A stolen server or a
compromised build account is not enough to publish code that runs in your
browser.

WEBCAT also pins our Content Security Policy, which forbids the site from
loading or contacting anything off this domain. That is why there are no
fonts, icons, scripts, or analytics from a CDN anywhere in this app: a
request to a third party would tell that third party your IP address and when
you were here.

Installing the extension is worth it if you are at higher risk. Everything
else on this page is true whether you install it or not.

## What this does not protect against

We would rather be blunt about the limits than let you over-trust the tool.

- **A compromised device.** Malware, spyware, or a hostile browser extension on your computer can read what is on your screen and what is in your browser's storage. Encryption cannot help there.
- **Anyone holding the link.** Reading, editing, and deleting are all the same capability, and we cannot tell them apart.
- **Metadata under subpoena.** Whoever hosts our database or carries our traffic can generally be compelled to produce ciphertext, record ids, coarse dates, and access logs. None of that decrypts your matrix, but it is not nothing.
- **Traffic patterns.** Someone with access to our server logs can see that a shared matrix is being edited, how often, and roughly how large each edit is.
- **Losing the link.** There are no accounts, so there is no recovery flow. Lose the link, lose the cloud copy.

The full accounting, including what we deliberately decided not to defend
against, is in our [threat model](${THREAT_MODEL_URL}).

## Check for yourself

Do not take our word for any of it. The whole site is open source at
[github.com/ActivistChecklist/riskmapper](${REPO_URL}). The encryption lives
in \`lib/e2ee/\`, everything the server is capable of seeing is in
\`lib/cloud/\`, and the signing process is in \`scripts/webcat-sign.mjs\`.

For what we log when you visit this site, see [Privacy](/privacy/).

Found a problem? Open an issue on GitHub, or
[get in touch](https://activistchecklist.org/contact/).
`}
    </DocPage>
  );
}
