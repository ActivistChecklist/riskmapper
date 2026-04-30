# Risk Matrix

A client-side risk matrix workspace built with Next.js (App Router). Organize risks, categories, and mitigations in the browser.

**[View Risk Matrix site →](https://activistchecklist.github.io/riskmatrix/)**

## Setup

```bash
yarn install
yarn dev
```

Open [http://localhost:3000](http://localhost:3000).

## Optional cloud sync (E2EE)

Cloud-saved matrices and link sharing are opt-in per matrix and end-to-end
encrypted: the relay server never sees plaintext, titles, or keys. See
[THREAT-MODEL.md](THREAT-MODEL.md) for the trust assumptions and
[server/README.md](server/README.md) for deploying the relay (Express + Mongo).

To enable in the client, set `NEXT_PUBLIC_CLOUD_API_URL` to your relay's
origin. When unset, all cloud affordances are hidden.

## License

See [LICENSE](LICENSE) (GNU GPL v3).
