# One-time copy: Railway MongoDB to SQLite

Copies every shared matrix and its update log from the MongoDB the app used
on Railway into a SQLite file the app can open as its `SQLITE_PATH`. It only
reads from Mongo.

This folder has its own `package.json` so that the app itself no longer
depends on `mongodb`. Nothing here is part of the build or the deploy.

## What it does

- Makes the SQLite file hold exactly what Mongo holds: it deletes every row
  in the file and inserts every Mongo document, in one transaction. Running
  it twice gives the same file, so you can rehearse now and run it again at
  cutover over the same file. If anything fails part way, the file is left as
  it was.
- Refuses to run when the source has no matrices, which almost always means a
  wrong `MONGO_DB`, rather than emptying the target.
- Drops each update's old `_id`. Rows written before the app set its own ids
  carry a MongoDB ObjectId, which embeds the time of that edit to the second.
- Gives a matrix with no `lastActivityDate` its latest recorded day (under
  MongoDB such a record never expired). Turns any other date into a calendar
  day.
- Leaves out updates whose matrix is gone. The old orphan sweep would have
  deleted them anyway.
- Prints counts, never ids or the connection string, and exits non-zero
  unless SQLite ends up holding exactly what was copied.

## Run it

From the repo root, on a machine with the Railway CLI logged in and linked to
the `RiskMapper.app` project (`railway link`):

```bash
yarn --cwd scripts/mongo-to-sqlite install --frozen-lockfile
```

The database has no public address, so open a tunnel in a separate terminal
and leave it running. It prints connection details including the password:
don't paste or share that output.

```bash
railway connect MongoDB --tunnel-only --port 27018
```

Then run the copy with the app service's variables, which carry `MONGO_URL`
and any `MONGO_DB` override. `MONGO_TUNNEL` swaps the private host in
`MONGO_URL` for the tunnel. Write the file outside the repo, somewhere
encrypted: it is production data.

```bash
MONGO_TUNNEL=127.0.0.1:27018 SQLITE_PATH="$HOME/riskmapper-cutover/riskmapper.sqlite" railway run --service <app service> -- node scripts/mongo-to-sqlite/copy.mts
```

The `MongoDB` service's variables work too, but then set `MONGO_DB` yourself
if the app overrides it. The default is `riskmatrix`.

Output looks like this:

```
mongo-to-sqlite: riskmatrix.matrices and riskmatrix.matrix_updates -> /.../riskmapper.sqlite
  matrices        in Mongo 26, copied 26, skipped 0 (non-string id), in SQLite 26
  matrix_updates  in Mongo 76, copied 75, orphaned 1, skipped 0 (malformed), in SQLite 75
  ciphertext      copied 3255 chars, in SQLite 3255 chars
  OK: SQLite holds exactly what was copied
```

`in Mongo` is what the collections held, so it can be checked against a
`countDocuments()` in `mongosh`. The file is created 0600 in a 0700 directory.

## At cutover

1. Stop writes on Railway, so nothing changes after the copy.
2. Run the copy again over the rehearsal file.
3. Put the file at the server's `SQLITE_PATH`, keeping it 0600. The app
   tightens it to 0600 on open anyway.
4. Start the app there, open a shared link, and check it loads.
5. Delete the copy on your machine.

To typecheck `copy.mts`, which the root `yarn typecheck` skips because it
needs this folder's `mongodb`: `npx tsc -p scripts/mongo-to-sqlite`.
