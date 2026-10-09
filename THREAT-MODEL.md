# Risk Mapper: what cloud sync protects (and what it doesn't)

Risk Mapper can save your matrices to a server and let you share them via a
link. This page is for users deciding whether the feature fits their needs.
It's plain-English on purpose; for the cryptographic implementation details,
see the code under `lib/e2ee/` and `server/routes/`.

The shorter, friendlier version of this document is the site's own
[Security page](https://riskmapper.app/security/). Keep the two in step.

## How it works, in one paragraph

When you choose to save a matrix to the cloud, the matrix is encrypted on
your device before it leaves. Only ciphertext reaches the server. The
encryption key lives in the part of the URL after `#`, which browsers don't
send to servers. Anyone you give the URL to can read and edit the matrix
the same way you can.

## What's protected

**The server can't read your matrices.** Whoever runs the server can't see
your risks, your mitigations, or even the matrix title. They see opaque
encrypted blobs, coarse calendar dates, sequence numbers, and per-writer
labels attached to updates, but not the plaintext inside the blobs.

**The server can't tamper without you noticing.** If the server modifies
the blob, swaps blobs between matrices, or changes their version numbers,
your client's decryption fails loudly. You won't silently see the wrong
content.

**Rollbacks and lost history are not the same as decrypt failures.** The
client does not cryptographically verify that every sync is strictly newer
than every version you've ever seen. If a host restores an older database
snapshot or drops some updates, your app may merge older Yjs data into
your document instead of showing a dedicated "rollback detected" error.
Tampering that breaks the authenticated encryption still fails at decrypt
time; **missing or replayed ciphertext** is handled by CRDT merge rules, not
by a hard refusal.

**The code you're running is signed, and the signature is public.** The site
is enrolled in [WEBCAT](https://github.com/freedomofpress/webcat). A visitor
with the WEBCAT extension installed has their browser verify every HTML, JS
and CSS file against a manifest signed by a hardware token before any of it
runs, and refuse the page if it doesn't match. The signature is recorded in a
public transparency log, so a targeted build served to one person is
detectable rather than invisible. This narrows, but does not close, the
"compromised version of Risk Mapper" risk below: see that entry for what
remains.

**Network observers can't read your matrices.** Anyone watching the
connection sees only encrypted blobs. The encryption key in the URL
fragment never travels over the wire.

## What's not protected

**Anyone with the link can read, edit, or delete the cloud copy.** The URL
is a full capability: same read/write as you, and anyone who has it can
remove the matrix from the server (or use Stop sharing from their session).
There is **no view-only** share link. Treat the URL like a password and
share it through a private channel only.

**Deleting or jamming a shared matrix only takes the id.** The id is the
part of the link before the `#`. Unlike the key, it does reach our servers,
so it can turn up in access logs. The server doesn't check anything else
before it deletes a matrix or accepts a new edit. Someone with only the id
still can't read the matrix, but they can delete the cloud copy, or send
one junk edit that stops it from loading for everyone.

**Opening a shared link leaves a copy on your device.** The matrix is saved
in your browser as soon as the link opens, next to your own matrices, and
stays there until you delete it. Anyone who gets into that browser later
can read it, even after the link stops working.

**Subpoenas and lawful requests can still obtain metadata.** Whoever hosts
the database or HTTP infrastructure can usually be compelled to produce
ciphertext, record ids, coarse dates, access logs (timestamps, IPs, paths),
and similar material. That does **not** let them decrypt matrix **contents**
without the secret in the URL fragment, but it is **not** the case that
there is "nothing" responsive to a subpoena.

**The link itself can leak.** Browser history, browser sync, screenshots,
screen-sharing, smart clipboards, pasting into a chat client: any of
these can expose the URL, and with it the encryption key. We can't prevent
that.

**A compromised device, browser, or extension defeats this.** If something
on your computer can read your screen or your browser's storage, it can
read your matrices. Same goes for OS-level malware. We don't defend
against either.

**A compromised version of Risk Mapper itself defeats this.** If someone
takes over our hosting or build pipeline and ships modified JavaScript,
that JavaScript can exfiltrate your keys before encryption. This is the
standard caveat for any browser-based encryption tool, and WEBCAT reduces it
rather than removing it:

- Signing needs the physical token, its PIN and a touch, so seizing the
  server or the CI account is not enough to publish running code.
- Every signature lands in a public transparency log, so a malicious build
  can't be shown to one target and hidden from everyone else.
- **But** it only protects visitors who have the extension installed;
  everyone else runs whatever is served. And it proves the code came from
  our signing key, not that the code is safe. If the token itself is
  compromised, or if we sign a bad build, the signature is still valid.

**There are no accounts, no logins.** The link IS the credential. Lose the
link, lose access. There's no "log in to recover" flow.

**Collaboration is live, but simple.** Edits reach everyone who has the
matrix open within a moment or two and merge on their own. But if two
people change the same thing at the same time (one risk, one mitigation,
or the notes), only one of the two changes survives, and the other is lost
without a warning.

**No forward secrecy.** Once a key has leaked, all past and future
versions of that matrix are exposed for as long as the matrix exists on
the server. Stopping sharing deletes it.

**Traffic patterns can leak a little.** Someone with access to the
server's logs can see when a matrix is being edited, how often, and the
size of each individual edit on the wire. For matrices with the rigid
risk-matrix shape, that size mostly reveals the *kind* of edit (a
keystroke vs. a paste vs. adding a risk vs. importing a baseline), not
which specific text or category the user touched.

## Downloading and importing matrices

You can also take a matrix out of Risk Mapper as a file, and bring one back
in with Import. Neither involves our servers.

**Downloads are not encrypted.** That goes for the RiskMapper.app export
format, PDFs, spreadsheets, and anything you copy to the clipboard. Anyone
who gets the file, or the device it's on, can read all of it. Send it over
something end-to-end encrypted like Signal, and delete copies you no longer
need.

**A download never includes the key to a shared matrix.** Passing the file
around doesn't hand out access to the cloud copy. It doesn't include any
dates either.

**An imported file is treated as hostile.** It could come from a stranger,
or from someone posing as an ally. Risk Mapper caps how big a file can be,
strips characters that can disguise text, and shows you what's in the file
before saving anything. It can't overwrite one of your matrices or pass
itself off as one, and if your browser doesn't have room for it, nothing
changes.

**Downloads assume the text could be hostile too.** Some of what's in a
matrix may have been written by someone else. So a spreadsheet export can't
run formulas, copied text can't make the app you paste it into load images
from another site, and links in the notes only work if they're ordinary
web, email, or phone links.

**Nothing checks the advice.** A file can be full of bad suggestions, already
starred as actions, and Risk Mapper has no way to tell.

## In plain words

This is "encrypted Pastebin / Cryptpad-style sharing." The server can't
read your matrix contents; the link is the password. Operators and hosts
can still see correlation metadata and ciphertext. If your device, your
browser, or our own hosting is compromised, the encryption doesn't help,
but no browser-based encryption tool can protect against that.

If you need stronger guarantees (verified identities, anonymity,
resistance to targeted attacks, end-to-end audit logs), this is not the
right tool.
