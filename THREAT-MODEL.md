# Risk Matrix — Threat Model


## What we are building

An **opt-in** capability-URL sharing model: the user creates an encrypted
copy of one matrix on a relay server, then shares a URL of the form

```
https://activistchecklist.github.io/riskmatrix/?matrix=<RECORD_ID>#k=<KEY_B64URL>&v=1
```

with collaborators. Anyone with that URL can read **and edit** the matrix.
The relay server stores only ciphertext and non-sensitive metadata
(`createdDate`, `lastWriteDate`, `lastReadDate`, monotonic `version`,
`lamport`).

---

## Cryptographic primitives

- **AEAD:** `crypto_aead_xchacha20poly1305_ietf_*` from libsodium
  (256-bit key, 192-bit nonce, 128-bit tag).
- **Random:** `sodium.randombytes_buf` for keys and nonces.
- **Envelope on the wire:**
  `v1.<base64url( algId(1B=0x01) || nonce(24B) || ciphertext )>`.
- **Plaintext payload:**
  `{ schemaVersion, title, snapshot, lamport }` JSON, then padded to a
  4 KiB boundary with an ISO/IEC 7816-4-style scheme (0x80, 0x00…).
- **AAD (associated data, authenticated, not encrypted):**
  `recordId || schemaVersion(1B) || version(8B BE) || lamport(8B BE)`.

The AAD binding for `version` and `lamport` is the load-bearing improvement
over the original spec — see "Why version is in the AAD" below.

---

## In scope (must hold)

### S1. Server cannot read plaintext

A passive or active attacker with full database access (including backups)
sees only opaque ciphertext, an opaque integer `lamport`, an `expectedVersion`
counter, and three calendar dates. **Titles are inside the encrypted blob**;
no metadata reveals what a matrix is *about*.

### S2. Server cannot move ciphertexts between rows

AAD includes the record id. A malicious server that copies row A's ciphertext
into row B will trigger an authentication failure when row B's owner tries
to decrypt — the AAD they reconstruct from `(recordId=B, version, lamport)`
won't match the AAD that was authenticated.

### S3. Server cannot rewrite `version` or `lamport` undetectably

`version` and `lamport` are bound into the AAD at encrypt time. If the
server rewrites them on the way back to a reader, the decrypt fails. The
client surfaces this as a hard, user-visible error — never silent failure.

### S4. Server cannot replay an old ciphertext (rollback)

Two layers of defense:

1. **Per-row AAD binding (S3 above):** an old ciphertext's AAD names an
   old version; if the server returns it labeled as a newer version, the
   client's reconstructed AAD won't match → decrypt fails. If the server
   returns it with its original metadata, see (2).
2. **Per-record `highestSeenVersion` store** (`cloudRollbackStore.ts`):
   the client records the largest `version` it has ever observed for each
   record id. If the server later returns a strictly smaller `version`,
   the client refuses to apply it and surfaces a `CloudRollbackError`.

Both are required: AAD-binding alone fails open if the server replays the
*original* (older) ciphertext-and-metadata pair; the high-water-mark store
catches that case.

### S5. Network observers cannot recover plaintext

Even an attacker who records every TLS-decrypted byte and the share-URL
load itself sees only opaque ciphertext envelopes. The capability key
sits in the URL **fragment** (`#k=…`), which browsers do not include in
the HTTP request line.

We additionally set `Referrer-Policy: no-referrer` on the client origin
(see [app/layout.tsx](app/layout.tsx)) so subresource fetches do not leak
the fragment via `Referer` headers, even though the standard already
strips fragments from `Referer`.

### S6. Capability URL grants edit access

Anyone with the full URL can read and edit. This is the **intended** v1
trust model — equivalent to "encrypted Pastebin / Cryptpad-style sharing."
Users are warned of this in the share dialog before any link is created.

### S7. Inbound shared links do not pollute the local library

Opening a share URL puts the user into a **sandbox**: the matrix is
decrypted in memory and shown read-only with a banner identifying it as
"viewing a shared matrix." The user must explicitly click "Save on this
device" before anything is written to localStorage.

---

## Out of scope (explicitly accepted risks)

### O1. URL leakage

Browser history, browser sync, screenshots, screen sharing, copy-paste
into a chat client, shoulder-surfing, smart clipboards. **Mitigations:**
the share dialog states the trust model in plain language, and `?matrix=…`
+ `#k=…` is recommended only via private channels.

### O2. Compromised devices and malicious extensions

A browser extension with broad permissions can read the URL fragment,
exfiltrate localStorage, and read decrypted DOM. The same applies to OS
malware. We do not defend against either; either compromise is total.

### O3. Compromised app server delivering modified JS

Any compromise of `activistchecklist.github.io` or its CI pipeline can
serve JS that exfiltrates keys before encryption, or stores plaintext
elsewhere. This is the standard "trust the origin" caveat for any web
crypto. Mitigations are deployment-time only (SRI, deterministic builds,
code transparency) and are **out of scope for v1**.

### O4. Identity, authentication, authorization

No accounts, no login, no per-recipient keys. Possession of `(recordId, key)`
is the only credential. Sharing is via capability URL only.

### O5. Server-side search, sort, or analytics over plaintext

Impossible by design. The relay can count records, watch sizes, observe
read/write times — that's it.

### O6. Real-time collaboration in v1

Two simultaneous editors of the same share will hit `409 Conflict` and be
prompted to choose "Reload remote" or "Keep mine and overwrite." Live
co-editing is reserved for Phase 2 (Yjs CRDT under encryption).

### O7. Forward secrecy and key ratcheting

The capability URL itself is the long-lived key; rotating it would defeat
the share model. Real ratcheting is overkill for an "encrypted shared
document" use case. Phase 3 may add per-record key rotation as an option.

### O8. Size-channel inference

Ciphertext length is approximately plaintext length + 16 bytes (auth tag).
v1 pads plaintext to 4 KiB blocks before encryption to coarsen this signal:
a passive observer of writes can no longer easily tell "user added a long
line" from "user reordered." Above 4 KiB the channel still leaks the next
block's worth of size.

### O9. Long-term traffic-analysis correlation

A relay operator can observe write timing patterns per record id and
infer "this matrix is being actively edited." We do not pad timing or
inject decoys.

---

## What we are NOT claiming

- This is **not** Signal-grade messaging. There is no forward secrecy,
  no key ratcheting, no out-of-band key verification, no presence privacy.
- This is "encrypted Pastebin / Cryptpad-style sharing." If your threat
  model excludes any of the items in **Out of scope** above, this is not
  the right tool.

---

## Why `version` is in the AAD (load-bearing change)

The original draft of the spec (§3.4) bound only
`recordId || schemaVersion(1B)` into AAD. We strengthened it to
`recordId || schemaVersion(1B) || version(8B BE) || lamport(8B BE)` for
two reasons:

1. **Defense against server-side metadata rewriting.** If `version` is
   plaintext-only metadata, a malicious server can return any older
   ciphertext with a freshly-incremented `version` field and the client
   has no cryptographic check on the labelling. Binding the version into
   AAD turns any such mismatch into a decrypt failure.
2. **Tighter optimistic-concurrency guarantees.** The server must not be
   trusted to "renumber" ciphertexts; the client computes `version`
   pre-encryption and the encrypted payload is permanently bound to it.

Trade-off: the server cannot increment `version` for the client. The
client must compute the next version and submit it as part of the
ciphertext (which our `MatrixCloudRepository.write` does correctly). This
is actually a feature — it removes one degree of freedom from the server.

---

## Audit and release gate

Before any public rollout where cloud sync is **on by default**, the
following are gating items:

- [ ] External cryptographic review of `lib/e2ee/*`.
- [ ] External review of the server request handlers
      (`server/src/app.ts`).
- [ ] Penetration test of the share-URL load path.
- [ ] Documented rollback / incident-response plan for "how do we revoke
      a leaked link."
- [ ] SRI or pinned-bundle strategy decided for the SPA build.

Until those are complete, cloud sync is **opt-in per matrix** with a
clear UX warning.
