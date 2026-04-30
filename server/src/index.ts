import { createApp } from "./app.js";
import { PORT } from "./config.js";
import { closeDb, getCollection } from "./db.js";
import { purgeStaleRecords } from "./purge.js";

async function main() {
  await getCollection(); // fail fast if Mongo is misconfigured
  const app = createApp();
  const server = app.listen(PORT, () => {
    console.log(`[risk-matrix-api] listening on :${PORT}`);
  });
  // Daily purge timer (single-instance). For multi-instance deploys, replace
  // with a cron job.
  const day = 24 * 3600_000;
  const purgeTimer = setInterval(() => {
    purgeStaleRecords()
      .then((n) => console.log(`[risk-matrix-api] purged ${n} stale records`))
      .catch((err) => console.error("[risk-matrix-api] purge failed:", err));
  }, day);

  const shutdown = async () => {
    console.log("[risk-matrix-api] shutting down");
    clearInterval(purgeTimer);
    server.close();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main().catch((err) => {
  console.error("[risk-matrix-api] fatal:", err);
  process.exit(1);
});
