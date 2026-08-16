#!/usr/bin/env node
/**
 * Check that the live site serves exactly what the signed manifest describes.
 *
 *   yarn webcat:verify [https://riskmapper.app]
 *
 * This is the guard that turns WEBCAT's failure mode from "users are silently
 * blocked" into "a script says no". Once the domain is enrolled, any served
 * byte that disagrees with the signed manifest is refused by the extension —
 * so this should pass before enrolling, and after every deploy afterwards.
 *
 * It is deliberately paranoid about *where* it reads from. Everything is
 * fetched over the network from the deployed origin; the local manifest is
 * used only to compare against. Verifying the local build against the local
 * manifest would prove nothing about what Railway actually serves.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");
const LOCAL_MANIFEST = path.join(ROOT, "public/.well-known/webcat/manifest.json");
const LOCAL_ENROLLMENT = path.join(ROOT, "public/.well-known/webcat/enrollment.json");
const ORIGIN = (process.argv[2] ?? "https://riskmapper.app").replace(/\/$/, "");
const CONCURRENCY = 8;

/**
 * Optional dead-man's-switch monitor (healthchecks.io or compatible).
 *
 * Set `WEBCAT_PING_URL` to the check's ping URL. On success we GET it; on
 * failure we POST to `<url>/fail` with the problem list as the body, so the
 * alert email says which files drifted rather than just "something is wrong".
 *
 * It lives in an env var and is never committed: anyone holding the URL can
 * post a false success and silence the alarm.
 *
 * The value of the monitor is as much the *missing* ping as the failing one.
 * If the site is down, or the job stops running at all, the monitor notices
 * on its own — which is exactly what a check that only runs after a deploy
 * can never do.
 */
const PING_URL = (process.env.WEBCAT_PING_URL ?? "").replace(/\/$/, "");

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `[${code}m${s}[0m` : s);
const bold = (s) => c("1", s);
const dim = (s) => c("2", s);
const green = (s) => c("32", s);
const red = (s) => c("31", s);
const yellow = (s) => c("33", s);
const cyan = (s) => c("36", s);

const problems = [];
const fail = (msg, detail) => problems.push({ msg, detail });

function b64url(buf) {
  return createHash("sha256").update(buf).digest("base64url");
}

async function fetchBytes(url) {
  const res = await fetch(url, { redirect: "manual" });
  const body = Buffer.from(await res.arrayBuffer());
  return { res, body };
}

/**
 * Report to the dead-man's-switch monitor. Never throws: a monitoring outage
 * must not turn a passing verification into a failing job.
 */
async function ping(problemList) {
  if (!PING_URL) {
    console.log(dim("      (no WEBCAT_PING_URL set, not reporting to a monitor)"));
    return;
  }
  const failed = problemList.length > 0;
  const url = failed ? `${PING_URL}/fail` : PING_URL;
  // healthchecks.io keeps the body as the check's log, so send the detail:
  // the alert then names the drifted files instead of just saying "failed".
  const body = failed
    ? `WEBCAT verification FAILED for ${ORIGIN}\n\n` +
      problemList.map((p) => `- ${p.msg}${p.detail ? `\n  ${p.detail}` : ""}`).join("\n")
    : `WEBCAT verification passed for ${ORIGIN}`;
  try {
    const res = await fetch(url, {
      method: "POST",
      body: body.slice(0, 10_000),
      signal: AbortSignal.timeout(10_000),
    });
    console.log(
      dim(`      monitor pinged (${failed ? "fail" : "success"}): HTTP ${res.status}`),
    );
  } catch (err) {
    console.log(yellow(`      could not reach the monitor: ${err.message}`));
  }
}

async function main() {
  console.log(bold(`\nWEBCAT verification against ${ORIGIN}`));
  console.log(dim("Confirms the deployed bytes match the signed manifest.\n"));

  const local = JSON.parse(readFileSync(LOCAL_MANIFEST, "utf8"));
  const localManifest = local.manifest ?? local;

  // 1. The manifest the site serves must be the one we signed. If this drifts,
  //    every file comparison below would be checking the wrong expectations.
  console.log(cyan("[1/5] ") + bold("Served manifest matches the signed one"));
  const manifestUrl = `${ORIGIN}/.well-known/webcat/manifest.json`;
  try {
    const { res, body } = await fetchBytes(manifestUrl);
    if (res.status !== 200) {
      fail(`manifest.json returned ${res.status}`, manifestUrl);
    } else {
      const localBytes = readFileSync(LOCAL_MANIFEST);
      if (b64url(body) === b64url(localBytes)) {
        console.log(`      ${green("✓")} byte-identical to the local signed manifest`);
      } else {
        fail(
          "the served manifest differs from the one signed locally",
          "The deploy is serving a different manifest than the one in git.",
        );
      }
    }
  } catch (err) {
    fail("could not fetch the manifest", `${manifestUrl}: ${err.message}`);
  }

  // 2. The bundle and enrollment have to be reachable too: the extension
  //    fetches them, and a 404 here reads as "not enrolled properly".
  console.log(cyan("[2/5] ") + bold("Enrollment and bundle are published"));
  const enrollmentHash = createHash("sha256")
    .update(readFileSync(LOCAL_ENROLLMENT))
    .digest("hex");
  for (const [label, url] of [
    ["enrollment.json", `${ORIGIN}/.well-known/webcat/enrollment.json`],
    ["bundle.json", `${ORIGIN}/.well-known/webcat/bundle.json`],
    [`enrollment object ${enrollmentHash.slice(0, 8)}…`, `${ORIGIN}/.well-known/webcat/${enrollmentHash}`],
  ]) {
    try {
      const { res } = await fetchBytes(url);
      if (res.status === 200) console.log(`      ${green("✓")} ${label}`);
      else fail(`${label} returned ${res.status}`, url);
    } catch (err) {
      fail(`${label} unreachable`, err.message);
    }
  }

  // 3. The CSP the server sends must match the manifest's, or extension users
  //    get a different policy from everyone else.
  console.log(cyan("[3/5] ") + bold("Served CSP matches the manifest"));
  try {
    const res = await fetch(`${ORIGIN}/`, { redirect: "manual" });
    const sent = res.headers.get("content-security-policy");
    if (!sent) {
      fail("no Content-Security-Policy header on /", "expected the manifest's default_csp");
    } else if (sent.trim() === localManifest.default_csp.trim()) {
      console.log(`      ${green("✓")} identical to default_csp`);
    } else {
      fail("the served CSP differs from the manifest's default_csp",
        `served:   ${sent}\nmanifest: ${localManifest.default_csp}`);
    }
  } catch (err) {
    fail("could not read the CSP header", err.message);
  }

  // 4. The heart of it: every file the manifest describes, fetched from the
  //    live origin and hashed.
  const entries = Object.entries(localManifest.files);
  console.log(cyan("[4/5] ") + bold(`Hashing ${entries.length} files from the live origin`));
  let checked = 0;
  const mismatches = [];
  const queue = [...entries];
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      for (;;) {
        const next = queue.shift();
        if (!next) return;
        const [filePath, expected] = next;
        const url = `${ORIGIN}${filePath}`;
        try {
          const { res, body } = await fetchBytes(url);
          if (res.status !== 200) {
            mismatches.push({ filePath, why: `HTTP ${res.status}` });
          } else {
            const got = b64url(body);
            if (got !== expected) {
              mismatches.push({
                filePath,
                why: `hash differs\n        expected ${expected}\n        served   ${got}`,
              });
            }
          }
        } catch (err) {
          mismatches.push({ filePath, why: err.message });
        }
        checked += 1;
        if (process.stdout.isTTY) {
          process.stdout.write(`\r      ${dim(`${checked}/${entries.length}`)}   `);
        }
      }
    }),
  );
  if (process.stdout.isTTY) process.stdout.write("\r" + " ".repeat(40) + "\r");
  if (mismatches.length === 0) {
    console.log(`      ${green("✓")} all ${entries.length} files match`);
  } else {
    for (const m of mismatches.slice(0, 12)) {
      fail(`${m.filePath}: ${m.why}`);
    }
    if (mismatches.length > 12) {
      fail(`…and ${mismatches.length - 12} more files`);
    }
  }

  // 5. Unlisted paths must resolve to the fallback document, which is how
  //    share links survive enforcement.
  console.log(cyan("[5/5] ") + bold("Fallback behaviour for unlisted paths"));
  try {
    const fallbackExpected = localManifest.files[localManifest.default_fallback];
    const { res, body } = await fetchBytes(`${ORIGIN}/grid/verifyprobe123456`);
    if (res.status !== 200) {
      fail(`a share-link path returned ${res.status}, expected 200`);
    } else if (b64url(body) !== fallbackExpected) {
      fail(
        "a share-link path does not serve the manifest's default_fallback",
        "Share links would be blocked once enrolled.",
      );
    } else {
      console.log(`      ${green("✓")} /grid/<id> serves ${localManifest.default_fallback}`);
    }
  } catch (err) {
    fail("could not check the fallback", err.message);
  }

  console.log("");
  await ping(problems);

  if (problems.length === 0) {
    console.log(green(bold("PASS — the live site matches the signed manifest.")));
    console.log(dim("Safe to enrol, and safe to re-run after any deploy."));
    process.exit(0);
  }
  console.log(red(bold(`FAIL — ${problems.length} problem(s):`)));
  for (const p of problems) {
    console.log(`  ${red("✗")} ${p.msg}`);
    if (p.detail) console.log(dim(`      ${p.detail.replace(/\n/g, "\n      ")}`));
  }
  console.log("");
  console.log(yellow("Do not enrol until this passes."));
  console.log(
    dim("If files differ, the deploy rebuilt them rather than serving what was\n" +
        "signed. Re-run `yarn webcat:sign` after the deploy, or switch to\n" +
        "deploying the prebuilt artifact. See MIGRATION.md."),
  );
  process.exit(1);
}

main().catch((err) => {
  console.error(red(`\nunexpected failure: ${err?.stack ?? err}`));
  process.exit(1);
});
