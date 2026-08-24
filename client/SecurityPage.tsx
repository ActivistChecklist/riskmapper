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
matrix by link with others, that data is always end-to-end encrypted and we
do not have the ability to decrypt it.

If we receive a legal order to hand that over, the only thing 
hand over is the encrypted data, the random id from the link, and the calendar day
each edit was made. We don't store the exact time the matrix was created or the edits
were made. We have access to store the title, your IP address, or the key that would decrypt the data.

## Your matrix stays in your browser by default

Everything you type is saved in your browser's storage on this device. Nothing
reaches our servers unless you enable sharing.

Risk to be aware of: Clearing your browser data deletes your matrices, and we 
have no copy to restore. If a matrix matters, export it.


Export: Exports are local too. Copying the worksheet and downloading the PDF both 
happen entirely in your browser.

## Share by link is the only time we have data, and it's fully end-to-end encrypted

Turning on **Share by link** is the one action that sends any part of your
data to our servers, and it is fully end-to-end encrypted. The key lives in the part of
the link after the \`#\`, which browsers never send to a server. We never see
it, so we cannot decrypt your matrix, hand it over, or lose it in a breach.

What is encrypted:

- ✅ The title of the matrix
- ✅ Every risk
- ✅ Every mitigation, including which ones you starred
- ✅ Everything in the notes section

What we hold on the server:

- The encrypted data, which we cannot read
- The random id from the link
- Calendar days in UTC, never times of day: when the matrix was created, when it was last edited or opened, and the day each individual edit was made
- A counter per edit, plus a random per-browser label, so edits from two devices can be merged

Separately from all of that, our web host keeps ordinary server logs, which do
record request times and IP addresses. Every website has these. They contain
nothing from your matrix, but they are not nothing, and we would rather say so
than let you assume otherwise.

We keep the dates for one reason: a shared matrix is deleted automatically
after ${RETENTION_DAYS} days with no activity. **Stop sharing** deletes the
server copy immediately, and anyone who had viewed it can still see a copy on their browser.

## Keep the link safe

The link is the password. There is no separate login and no view-only
version, so anyone who has the full link can read, edit, or delete the shared
copy. Anywhere the link goes, the matrix goes with it.

- Your browser history is the most common leak. Anyone with access to your computer, or to your unlocked browser, can find the link there.
- Chrome syncs history to your Google account, where it can be reached by a subpoena. Firefox, Brave, Edge, and Safari all sync too if you turn their sync features.

What we suggest:

- Send the link through Signal, not email or SMS.
- For higher-risk work, use [Tor Browser](https://www.torproject.org/download/), which keeps no history between sessions and hides your IP address from us.
- Avoid Google Chrome for anything sensitive, especially if you are signed into a Google account.
- Use **Stop sharing** when you are done with a link.

## The code you run is signed, to guarantee the server hasn't tamptered with it

Every tool that claims end-to-end ecnryption in your browser has the same weak point: 
you have to
trust that the JavaScript you were served is the JavaScript we wrote. Whoever
controls the hosting could be compelled to send a version of the JavaScript that quietly
copies your key before it encrypts anything, and you would not be able to tell by looking
unless you read the source code every time you visit the site.

To solve for this, Risk Mapper is enrolled in [WEBCAT](${WEBCAT_URL}), a code-signing system
from [Freedom of the Press Foundation](https://freedom.press). 
With the WEBCAT browser extension
installed, your browser checks every file this site serves against a
signature recorded in a public transparency log before it runs any of it. If
what arrives does not match what we signed, the extension blocks the page
instead of running it, and the mismatch is visible to anyone watching the log
rather than only to the person being attacked.

You can [install the WEBCAT Firefox extension here](https://addons.mozilla.org/en-US/firefox/addon/webcat/).

Installing the extension is worth it if you are at higher risk. Everything
else on this page is true whether you install it or not.

## What this does not protect against

The limitations of our approach include:

- **A compromised device.** Malware, spyware, or a hostile browser extension on your computer can read what is on your screen and what is in your browser's storage. Encryption cannot help there.
- **Anyone holding the link.** Reading, editing, and deleting are all the same capability, and we cannot tell them apart.
- **Metadata under subpoena.** Whoever hosts our database or carries our traffic can generally be compelled to produce coarse dates and access logs. None of that decrypts your matrix, but it is not nothing.
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
