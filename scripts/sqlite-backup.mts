/**
 * Offsite backup: snapshot the SQLite database and hand the snapshot to an
 * upload command.
 *
 *   SQLITE_PATH=/path/to/riskmapper.sqlite \
 *   SQLITE_BACKUP_UPLOAD_CMD='...' \
 *   node scripts/sqlite-backup.mts
 *
 * Where the backup goes, and the keys for getting it there, belong to the
 * server's environment and nowhere else: not this repo, not its docs. This
 * script only knows the command to run. It runs `SQLITE_BACKUP_UPLOAD_CMD`
 * with `/bin/sh -c`, with two extra variables set:
 *
 *   BACKUP_FILE   absolute path of the snapshot, deleted when the command exits
 *   BACKUP_NAME   suggested object name, `riskmapper-YYYY-MM-DD.sqlite`
 *
 * The command should encrypt the file before it leaves the server. The
 * matrices themselves are end-to-end encrypted already, but record ids,
 * calendar dates, write-token hashes and update counts are not, and a copy
 * at a second provider is a second place to seize them from. It also has to
 * expire old snapshots: a backup keeps a matrix after it is deleted here,
 * whether by "Stop sharing" or by the idle cleanup, until the backup itself
 * is gone.
 *
 * The snapshot is made with `VACUUM INTO`, which reads one consistent
 * transaction (safe while the server is writing; in WAL mode it does not
 * block writers) and writes only live rows, so deleted data does not ride
 * along. It is written into a fresh 0700 directory beside the database, as a
 * 0600 file, and the directory is removed whether or not the upload works.
 *
 * Runs straight from the source tree with Node's type stripping. Prints
 * counts only. Exits non-zero if anything fails, including the upload.
 */
import { spawnSync } from "node:child_process";
import { closeSync, existsSync, mkdtempSync, openSync, rmSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { BUSY_TIMEOUT_MS, countRows, sqlitePathFromEnv } from "../lib/cloud/sqliteStore.mts";

function snapshot(source: string, target: string): void {
  // Read-only: a backup must never create, migrate or otherwise touch the
  // live database.
  const db = new DatabaseSync(source, { readOnly: true, timeout: BUSY_TIMEOUT_MS });
  try {
    // VACUUM INTO wants a missing or empty target. Creating it first fixes
    // its mode at 0600 instead of whatever the umask allows.
    closeSync(openSync(target, "wx", 0o600));
    db.prepare("VACUUM INTO ?").run(target);
  } finally {
    db.close();
  }
}

function verify(file: string): { matrices: number; updates: number } {
  const db = new DatabaseSync(file, { readOnly: true });
  try {
    const { quick_check } = db.prepare("PRAGMA quick_check").get() as { quick_check: string };
    if (quick_check !== "ok") throw new Error(`snapshot failed quick_check: ${quick_check}`);
    return countRows(db);
  } finally {
    db.close();
  }
}

function main(): void {
  const uploadCmd = process.env.SQLITE_BACKUP_UPLOAD_CMD;
  if (!uploadCmd) throw new Error("SQLITE_BACKUP_UPLOAD_CMD is not set");
  const source = sqlitePathFromEnv();
  if (!existsSync(source)) throw new Error(`no SQLite database at ${source}`);

  const name = `riskmapper-${new Date().toISOString().slice(0, 10)}.sqlite`;
  const dir = mkdtempSync(path.join(path.dirname(source), ".backup-"));
  try {
    const file = path.join(dir, name);
    snapshot(source, file);
    const counts = verify(file);
    console.log(
      `sqlite-backup: snapshot ${name} holds ${counts.matrices} matrices and ${counts.updates} updates; uploading`,
    );
    const result = spawnSync("/bin/sh", ["-c", uploadCmd], {
      env: { ...process.env, BACKUP_FILE: file, BACKUP_NAME: name },
      stdio: ["ignore", "inherit", "inherit"],
    });
    if (result.error) throw result.error;
    if (result.status !== 0) {
      // Never echo the command: it may carry credentials inline.
      throw new Error(
        `upload command failed (${result.signal ? `signal ${result.signal}` : `exit ${result.status}`})`,
      );
    }
    console.log("sqlite-backup: upload done");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

try {
  main();
} catch (err) {
  console.error("sqlite-backup failed:", err instanceof Error ? err.message : err);
  process.exitCode = 1;
}
