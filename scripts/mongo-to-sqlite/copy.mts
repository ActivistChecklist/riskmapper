/**
 * One-time copy of the Railway MongoDB into a SQLite file. Usage and the
 * cutover steps are in README.md beside this file.
 *
 * Reads only. Makes the SQLite file at `SQLITE_PATH` hold exactly what Mongo
 * holds (see `replaceWithSource`), so it can be run again at cutover over a
 * rehearsal copy. Prints counts only: never the connection string, never a
 * record id.
 *
 * Environment:
 *   MONGO_URL                 connection string (from `railway run`)
 *   MONGO_TUNNEL              host:port of `railway connect --tunnel-only`,
 *                             replacing the private host in MONGO_URL
 *   MONGO_DB                  default "riskmatrix"
 *   MONGO_COLLECTION          default "matrices"
 *   MONGO_UPDATES_COLLECTION  default "matrix_updates"
 *   SQLITE_PATH               the SQLite file to write (required)
 */
import path from "node:path";
import { MongoClient } from "mongodb";
import { openDatabase } from "../../lib/cloud/sqliteStore.mts";
import { formatReport, replaceWithSource, type SourceDoc } from "./convert.mts";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** Credentials never reach the output, even inside a driver error message. */
function redactor(url: URL): (message: string) => string {
  const secrets = [url.password, url.username]
    .flatMap((s) => [s, decodeURIComponent(s)])
    .filter((s) => s.length > 0);
  return (message) => secrets.reduce((m, s) => m.split(s).join("***"), message);
}

function mongoUrl(): URL {
  const url = new URL(required("MONGO_URL"));
  const tunnel = process.env.MONGO_TUNNEL;
  if (tunnel) {
    url.host = tunnel;
    // The tunnel is one host. Without this the driver tries to discover the
    // rest of a replica set by its private names, which do not resolve here.
    url.searchParams.set("directConnection", "true");
  }
  return url;
}

async function main(redact: (m: string) => string, url: URL): Promise<void> {
  const target = path.resolve(required("SQLITE_PATH"));
  const dbName = process.env.MONGO_DB || "riskmatrix";
  const matricesName = process.env.MONGO_COLLECTION || "matrices";
  const updatesName = process.env.MONGO_UPDATES_COLLECTION || "matrix_updates";

  const client = new MongoClient(url.toString(), { serverSelectionTimeoutMS: 15_000 });
  try {
    await client.connect();
    const mongo = client.db(dbName);
    const db = openDatabase(target);
    try {
      console.log(
        `mongo-to-sqlite: ${dbName}.${matricesName} and ${dbName}.${updatesName} -> ${target}`,
      );
      const report = await replaceWithSource(db, {
        matrices: mongo.collection<SourceDoc>(matricesName).find({}),
        updates: mongo.collection<SourceDoc>(updatesName).find({}).sort({ recordId: 1, seq: 1 }),
      });
      console.log(formatReport(report));
      if (!report.ok) process.exitCode = 1;
    } finally {
      db.close();
    }
  } catch (err) {
    console.error("mongo-to-sqlite failed:", redact(err instanceof Error ? err.message : String(err)));
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}

let url: URL;
try {
  url = mongoUrl();
} catch (err) {
  // A malformed URL's message can include the URL itself.
  console.error(
    "mongo-to-sqlite failed:",
    err instanceof TypeError ? "MONGO_URL or MONGO_TUNNEL is not a valid URL" : (err as Error).message,
  );
  process.exit(1);
}
await main(redactor(url), url);
