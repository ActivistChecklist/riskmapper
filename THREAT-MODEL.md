# Risk Mapper: what cloud sync protects (and what it doesn't)

Risk Mapper can save your matrices to a server and let you share them via a
link. This page is for users deciding whether the feature fits their needs.
It's plain-English on purpose; for the cryptographic implementation details,
see the code under `lib/e2ee/` and `app/api/matrix/`.

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

**Network observers can't read your matrices.** Anyone watching the
connection sees only encrypted blobs. The encryption key in the URL
fragment never travels over the wire.

**Opening a shared link doesn't pollute your device.** When you click
someone's share URL, the matrix appears in a sandboxed preview. Nothing is
saved locally until you click "Save on this device."

## What's not protected

**Anyone with the link can read, edit, or delete the cloud copy.** The URL
is a full capability: same read/write as you, and anyone who has it can
remove the matrix from the server (or use Stop sharing from their session).
There is **no view-only** share link. Treat the URL like a password and
share it through a private channel only.

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

**A compromised version of Risk Matrix itself defeats this.** If someone
takes over our hosting or build pipeline and ships modified JavaScript,
that JavaScript can exfiltrate your keys before encryption. This is the
standard caveat for any browser-based encryption tool.

**There are no accounts, no logins.** The link IS the credential. Lose the
link, lose access. There's no "log in to recover" flow.

**No real-time collaboration.** Two people editing the same matrix at once
will collide; the second to save sees a "this was edited from another
device" prompt and chooses between their changes and the remote's. We
don't merge edits live.

**No forward secrecy.** Once a key has leaked, all past and future
versions of that matrix are exposed for as long as the matrix exists on
the server. Stopping sharing deletes it.

**Traffic patterns can leak a little.** Someone with access to the
server's logs can see when a matrix is being edited, how often, and the
size of each individual edit on the wire. For matrices with the rigid
risk-matrix shape, that size mostly reveals the *kind* of edit (a
keystroke vs. a paste vs. adding a risk vs. importing a baseline), not
which specific text or category the user touched.

## In plain words

This is "encrypted Pastebin / Cryptpad-style sharing." The server can't
read your matrix contents; the link is the password. Operators and hosts
can still see correlation metadata and ciphertext. If your device, your
browser, or our own hosting is compromised, the encryption doesn't help,
but no browser-based encryption tool can protect against that.

If you need stronger guarantees (verified identities, anonymity,
resistance to targeted attacks, end-to-end audit logs), this is not the
right tool.
