#!/usr/bin/env node
/**
 * Build, generate a WEBCAT manifest, sign it with the YubiKey, and publish
 * everything under `public/.well-known/webcat/`.
 *
 *   yarn webcat:sign
 *
 * Signing is deliberately a local, physical act. The private key lives only on
 * the token, and every signature needs the PIN plus a touch, so no CI system
 * and no compelled third party can produce a signature on your behalf. That is
 * the whole point of the setup, and the reason this script exists rather than
 * a GitHub Actions workflow. See MIGRATION.md decision D1.
 *
 * The touch prompt is loud on purpose. The YubiKey's own indicator is a slow
 * dim blink that is easy to miss, and a missed touch looks like a hang: the
 * signature just never completes.
 */
import { execFileSync, spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from "node:fs";
import path from "node:path";
import process from "node:process";
import readline from "node:readline";

const ROOT = path.resolve(import.meta.dirname, "..");
const WELL_KNOWN = path.join(ROOT, "public/.well-known/webcat");
const TRUST_POLICY = path.join(ROOT, "webcat/trust_policy");
const SIGNER_PUB = path.join(ROOT, "webcat/signer.pub");
const RATE_LIMIT_KEY = path.join(ROOT, "webcat/rate-limit-key");
/** Domain whose DNS carries the rate-limit key, at _sigsum_v1.<domain>. */
const SIGNING_DOMAIN = "riskmapper.app";
const ENROLLMENT = path.join(WELL_KNOWN, "enrollment.json");
const GENERATED_CONFIG = path.join(ROOT, "webcat.config.generated.json");
const UNSIGNED = path.join(ROOT, "webcat.manifest.unsigned.json");
const MANIFEST = path.join(WELL_KNOWN, "manifest.json");
const BUNDLE = path.join(WELL_KNOWN, "bundle.json");

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `[${code}m${s}[0m` : s);
const bold = (s) => c("1", s);
const dim = (s) => c("2", s);
const green = (s) => c("32", s);
const yellow = (s) => c("33", s);
const red = (s) => c("31", s);
const cyan = (s) => c("36", s);

let stepNo = 0;
const TOTAL_STEPS = 6;
function step(title) {
  stepNo += 1;
  console.log(`\n${cyan(`[${stepNo}/${TOTAL_STEPS}]`)} ${bold(title)}`);
}
function ok(msg) {
  console.log(`      ${green("✓")} ${msg}`);
}
function info(msg) {
  console.log(`      ${dim(msg)}`);
}
function die(msg, detail) {
  console.error(`\n${red("✗ " + msg)}`);
  if (detail) console.error(dim(String(detail).trim()));
  process.exit(1);
}

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: ROOT,
    encoding: "utf8",
    stdio: opts.inherit ? "inherit" : "pipe",
    env: opts.env ?? process.env,
  });
  if (res.error) die(`could not run ${cmd}`, res.error.message);
  if (res.status !== 0) {
    die(`${cmd} ${args[0] ?? ""} failed`, opts.inherit ? "" : res.stderr || res.stdout);
  }
  return res.stdout ?? "";
}

/**
 * webcat-cli spawns `sigsum-submit` by bare name, so it has to be on PATH of
 * the child process. `go install` puts it in ~/go/bin, which is not on a
 * default macOS login PATH — without this the run dies at the signing step
 * with a spawn error that says nothing about the real cause.
 */
function ensureSigsumOnPath() {
  const candidates = [
    ...(process.env.PATH ?? "").split(path.delimiter),
    path.join(process.env.HOME ?? "", "go/bin"),
    path.join(process.env.GOPATH ?? "", "bin"),
  ].filter(Boolean);

  for (const dir of candidates) {
    if (existsSync(path.join(dir, "sigsum-submit"))) {
      if (!(process.env.PATH ?? "").split(path.delimiter).includes(dir)) {
        process.env.PATH = `${dir}${path.delimiter}${process.env.PATH}`;
      }
      return path.join(dir, "sigsum-submit");
    }
  }
  die(
    "sigsum-submit not found",
    "webcat-cli shells out to it to sign. Install with:\n" +
      "  go install sigsum.org/sigsum-go/cmd/sigsum-submit@latest\n" +
      "then re-run. (It lands in ~/go/bin, which this script looks in.)",
  );
}

/**
 * gpg-agent only starts on demand, and does not survive a reboot or a
 * `gpgconf --kill`. Starting it here is idempotent and cheap, and saves the
 * run from failing on something that is never the interesting problem.
 */
function ensureAgentRunning() {
  spawnSync("gpgconf", ["--launch", "gpg-agent"], { stdio: "ignore" });
}

/** The ssh-agent gpg-agent exposes, which is how the token gets reached. */
function agentSocket() {
  try {
    return execFileSync("gpgconf", ["--list-dirs", "agent-ssh-socket"], {
      encoding: "utf8",
    }).trim();
  } catch (err) {
    die("could not locate the gpg-agent ssh socket", err.message);
  }
}

function listAgentKeys(sock) {
  const res = spawnSync("ssh-add", ["-L"], {
    encoding: "utf8",
    env: { ...process.env, SSH_AUTH_SOCK: sock },
  });
  return res.status === 0 ? (res.stdout ?? "").trim() : "";
}

function assertTokenPresent(sock) {
  let listed = listAgentKeys(sock);

  if (!listed) {
    // scdaemon can be holding a stale view of the card, typically after the
    // token was unplugged and re-inserted. Reading card status re-establishes
    // it, and then the key shows up.
    info("agent has no keys yet, re-reading the card…");
    spawnSync("gpg", ["--card-status"], { stdio: "ignore" });
    listed = listAgentKeys(sock);
  }

  if (!listed) {
    die(
      "no key available from the agent",
      "The YubiKey is plugged in but the agent is not offering its key.\n" +
        "Things worth trying, in order:\n" +
        "  1. Unplug and re-insert the YubiKey, then re-run.\n" +
        "  2. gpgconf --kill gpg-agent && gpgconf --launch gpg-agent\n" +
        "  3. Check the key is still there: gpg --card-status\n" +
        "  4. Confirm the keygrip is listed: cat ~/.gnupg/sshcontrol",
    );
  }
  const want = readFileSync(SIGNER_PUB, "utf8").trim().split(/\s+/)[1];
  if (!listed.includes(want)) {
    die(
      "the agent is offering a different key than webcat/signer.pub",
      "A signature from the wrong key produces a manifest the extension will reject.\n" +
        `agent: ${listed.split("\n")[0]}`,
    );
  }
  return listed.split("\n")[0];
}

/**
 * Public sigsum logs rate-limit anonymous submissions, and reject them once a
 * small shared quota is spent — the "(429) rate-limit for unknown domain
 * exceeded" you get otherwise. Registered submitters sign a token with a key
 * published at `_sigsum_v1.<domain>` in DNS, which sigsum-submit passes with
 * `-a` and `-d`.
 *
 * webcat-cli 0.1.3 invokes `sigsum-submit` without those flags. Rather than
 * pin webcat-cli to an unreleased git branch — worse for auditability on a
 * project whose threat model names the build pipeline — we put a small wrapper
 * of our own earlier on PATH. It is generated here rather than committed so it
 * always points at whichever sigsum-submit we actually resolved.
 *
 * The rate-limit key is an anti-spam credential, not a security boundary: it
 * authorises submissions against our quota and signs no content. That is why a
 * plain file key is fine, and why it is a different key from the YubiKey.
 */
function stageSubmitShim(realSubmit) {
  if (!existsSync(RATE_LIMIT_KEY)) return null;
  const binDir = path.join(ROOT, "node_modules/.cache/webcat/bin");
  mkdirSync(binDir, { recursive: true });
  const shim = path.join(binDir, "sigsum-submit");
  writeFileSync(
    shim,
    `#!/bin/sh\n# generated by scripts/webcat-sign.mjs\n` +
      `exec ${JSON.stringify(realSubmit)} -a ${JSON.stringify(RATE_LIMIT_KEY)} ` +
      `-d ${JSON.stringify(SIGNING_DOMAIN)} "$@"\n`,
    { mode: 0o755 },
  );
  process.env.PATH = `${binDir}${path.delimiter}${process.env.PATH}`;
  return shim;
}

/**
 * webcat-cli treats `-k` as a *private* key path: it reads `<path>.pub` to
 * derive the signer identity, then passes `<path>` itself to sigsum-submit.
 * Our private half only exists on the YubiKey and has no file at all, so we
 * stage a pair where both names hold the public key. sigsum-submit reads the
 * content rather than trusting the name, sees a public key, and signs through
 * the ssh-agent — which is exactly the path we want.
 */
function stageKeyPair() {
  const dir = path.join(ROOT, "node_modules/.cache/webcat");
  mkdirSync(dir, { recursive: true });
  const base = path.join(dir, "signer");
  const pub = readFileSync(SIGNER_PUB);
  writeFileSync(base, pub);
  writeFileSync(`${base}.pub`, pub);
  return base;
}

/**
 * Narrates the two phases of a signature so the touch moment is unmissable.
 *
 * There is no direct "the card is waiting for a touch" event to subscribe to,
 * but the pinentry process brackets the PIN phase precisely: it appears when
 * the dialog opens and exits once the PIN is accepted. The instant it goes
 * away, the only thing left for the card to want is a finger. That transition
 * is what we announce.
 *
 * The PIN dialog can take ten seconds or so to appear, and when the PIN is
 * still cached from an earlier signature no dialog appears at all — both cases
 * previously looked like a hang, and a missed touch just times out.
 */
function watchForTouchMoment() {
  let phase = "waiting";
  let sawPinentry = false;
  const started = Date.now();

  const announceTouch = (why) => {
    if (phase === "touch") return;
    phase = "touch";
    // Bell first: this is the moment the user has to act on.
    process.stdout.write("");
    console.log("");
    console.log(yellow(bold("      ▶ TOUCH THE YUBIKEY NOW")));
    console.log(dim(`        ${why}`));
    console.log(dim("        Tap the metal contact. It waits ~15s, then gives up."));
  };

  const timer = setInterval(() => {
    const up =
      spawnSync("pgrep", ["-f", "pinentry"], { stdio: "ignore" }).status === 0;

    if (up && !sawPinentry) {
      sawPinentry = true;
      phase = "pin";
      console.log(cyan("      ● PIN dialog is open — enter your OpenPGP PIN."));
    } else if (!up && sawPinentry && phase === "pin") {
      announceTouch("PIN accepted.");
    } else if (
      !up && !sawPinentry && phase === "waiting" && Date.now() - started > 4000
    ) {
      // No dialog at all: the card is still unlocked from a previous
      // signature this session, so it goes straight to wanting the touch.
      announceTouch("No PIN needed — the card is already unlocked.");
    }
  }, 250);
  timer.unref?.();
  return () => clearInterval(timer);
}

/** Loud, blocking prompt. A missed touch is indistinguishable from a hang. */
async function promptForTouch() {
  // Padded on visible width. Escape codes inside the box would throw the
  // alignment off, so content stays uncoloured and the whole line is coloured.
  const W = 58;
  const row = (s) => yellow("  \u2502") + s.padEnd(W) + yellow("\u2502");
  console.log("");
  console.log(yellow(`  \u250c${"\u2500".repeat(W)}\u2510`));
  console.log(row("  ACTION NEEDED: enter your PIN, then TOUCH the key"));
  console.log(yellow(`  \u251c${"\u2500".repeat(W)}\u2524`));
  console.log(row("  1. A PIN dialog appears. Enter the OpenPGP PIN."));
  console.log(row("  2. Then physically tap the metal contact on the"));
  console.log(row("     YubiKey. Its blink is dim and easy to miss."));
  console.log(row(""));
  console.log(row("  If this looks like it has hung, it is waiting"));
  console.log(row("  for your finger."));
  console.log(yellow(`  \u2514${"\u2500".repeat(W)}\u2518`))
  // Terminal bell: the one cue that works when the window is in the background.
  process.stdout.write("");

  if (process.stdin.isTTY) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    await new Promise((resolve) =>
      rl.question(dim("      Press Enter when you are ready to sign… "), () => {
        rl.close();
        resolve();
      }),
    );
  }
  console.log(dim("      Starting. The PIN dialog can take ~10s to appear."));
}

async function main() {
  console.log(bold("\nWEBCAT manifest signing"));
  console.log(dim("Signs riskmapper.app's manifest with the YubiKey. Local and physical by design."));

  for (const [label, p] of [
    ["trust policy", TRUST_POLICY],
    ["signer public key", SIGNER_PUB],
    ["enrollment", ENROLLMENT],
  ]) {
    if (!existsSync(p)) die(`missing ${label}: ${path.relative(ROOT, p)}`);
  }

  step("Checking the YubiKey");
  const submitPath = ensureSigsumOnPath();
  ensureAgentRunning();
  const sock = agentSocket();
  const key = assertTokenPresent(sock);
  ok(`agent is offering ${key.split(" ")[2] ?? "the signing key"}`);
  info(`sigsum-submit ${submitPath}`);
  info(`socket ${sock}`);

  if (stageSubmitShim(submitPath)) {
    ok(`submitting under the registered domain ${SIGNING_DOMAIN}`);
  } else {
    info(
      `no ${path.relative(ROOT, RATE_LIMIT_KEY)} — submitting anonymously.\n` +
        "      Public logs share a small anonymous quota, so this may fail with\n" +
        '      "(429) rate-limit for unknown domain exceeded". See MIGRATION.md.',
    );
  }

  step("Building the site");
  run("yarn", ["build"]);
  if (!existsSync(GENERATED_CONFIG)) {
    die("the build did not write webcat.config.generated.json");
  }
  const wasm = JSON.parse(readFileSync(GENERATED_CONFIG, "utf8")).wasm ?? [];
  ok(`dist/ built, ${wasm.length} embedded wasm module(s) declared`);

  step("Generating the manifest");
  // Dotfiles are skipped by default, which is what keeps /.well-known/webcat/
  // out of the manifest that describes it.
  run("npx", [
    "webcat", "manifest", "generate",
    "--type", "sigsum",
    "--policy-file", TRUST_POLICY,
    "--config", GENERATED_CONFIG,
    "--directory", path.join(ROOT, "dist"),
    "--output", UNSIGNED,
  ]);
  const unsigned = JSON.parse(readFileSync(UNSIGNED, "utf8"));
  const files = unsigned.manifest?.files ?? unsigned.files ?? {};
  const fileCount = Object.keys(files).length;
  if (fileCount === 0) {
    die(
      "the manifest covers zero files",
      "That would sign an empty description of the site. Check that dist/ was built.",
    );
  }
  ok(`manifest covers ${fileCount} files`);

  step("Signing with the YubiKey");
  await promptForTouch();
  // Async spawn, not spawnSync: the touch watcher runs on a timer, and a
  // synchronous child would block the event loop and silence it.
  const stopWatching = watchForTouchMoment();
  const status = await new Promise((resolve) => {
    const child = spawn(
      "npx",
      [
        "webcat", "manifest", "sign",
        "--type", "sigsum",
        "--policy-file", TRUST_POLICY,
        "-i", UNSIGNED,
        "-k", stageKeyPair(),
        "-o", MANIFEST,
      ],
      { cwd: ROOT, stdio: "inherit", env: { ...process.env, SSH_AUTH_SOCK: sock } },
    );
    child.on("error", (err) => die("could not run webcat manifest sign", err.message));
    child.on("close", resolve);
  });
  stopWatching();
  if (status !== 0) {
    die(
      "signing failed",
      "'agent refused signature request' -> the touch probably timed out; just re-run.\n" +
        "'(429) rate-limit for unknown domain exceeded' -> the rate-limit key is\n" +
        "  missing or its DNS record is not published yet.\n" +
        "'TLS handshake timeout' -> a log was unreachable; re-running picks the other.",
    );
  }
  ok("manifest signed and logged to the sigsum transparency logs");

  step("Assembling the bundle");
  run("npx", [
    "webcat", "bundle", "create",
    "-e", ENROLLMENT,
    "-m", MANIFEST,
    "-o", BUNDLE,
  ]);
  ok(`bundle written to ${path.relative(ROOT, BUNDLE)}`);

  step("Publishing and verifying");
  // `cas_url` exists so the enrollment can be fetched as `<cas_url>/<sha256>`,
  // so that is the one object that has to be served. webcat-cli also drops its
  // working artifacts into cas/ — leaf checksums, signatures, proof blobs —
  // and publishing the whole directory meant every run added a few more stale
  // files to the repo forever. bundle.json is self-contained (it carries the
  // enrollment, manifest and signatures inline), so nothing else is needed.
  //
  // Deliberately additive: previously published enrollment objects are left
  // alone. A client may hold a cached enrollment for up to max_age (180 days)
  // and still resolve it by hash, so removing an old one could break a client
  // that has not refreshed yet.
  mkdirSync(WELL_KNOWN, { recursive: true });
  const enrollmentHash = createHash("sha256")
    .update(readFileSync(ENROLLMENT))
    .digest("hex");
  const enrollmentObject = path.join(WELL_KNOWN, enrollmentHash);
  if (!existsSync(enrollmentObject)) {
    copyFileSync(ENROLLMENT, enrollmentObject);
    ok(`published enrollment object ${enrollmentHash.slice(0, 12)}…`);
  } else {
    ok(`enrollment object ${enrollmentHash.slice(0, 12)}… already published`);
  }
  run("npx", ["webcat", "manifest", "verify", BUNDLE]);
  ok("bundle verifies against the enrollment");
  rmSync(UNSIGNED, { force: true });

  console.log(`\n${green(bold("Done."))} Signed artifacts are in ${bold("public/.well-known/webcat/")}`);
  console.log(dim("They ship on the next deploy, because public/ is copied into dist/."));
  console.log(
    dim("Re-run this whenever the site changes: a manifest that does not match\n" +
        "the deployed bytes blocks the site for anyone running the extension."),
  );
}

main().catch((err) => die("unexpected failure", err?.stack ?? err));
