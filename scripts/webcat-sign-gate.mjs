#!/usr/bin/env node
/**
 * Offer to sign, at the last moment where signing still helps: pushing main.
 * Wired into `.githooks/pre-push`.
 *
 * Why here and not at commit time: the signed manifest under
 * `public/.well-known/webcat/` describes `dist/` byte for byte, so any source
 * change invalidates it, but signing hashes a *build*, so it can only describe
 * a finished state. A push is exactly that state, and it is the moment before
 * the two failure modes become real:
 *
 *   1. Anyone running the WEBCAT extension is refused the site outright, and
 *      the failure is invisible to everyone who is not running it.
 *   2. The deploy does not promote: server/verifyManifest.ts fails
 *      /api/healthz on a mismatch, so Railway keeps the previous version.
 *
 * Saying yes runs scripts/webcat-sign.mjs right here (YubiKey, PIN, tap),
 * commits the refreshed artifacts, and pushes them, because the ref list git
 * resolved before this hook ran cannot be changed from inside it. The outer
 * push is then stopped, having nothing left to send. Saying no lets the push
 * through with the consequence spelled out.
 *
 * Bypass entirely with WEBCAT_SIGN_REMINDER=off.
 */
import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, readSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = path.resolve(import.meta.dirname, "..");

/** The ref a deploy is cut from. Pushes of anything else are not asked about. */
export const DEPLOY_REF = "refs/heads/main";

/** The file whose last change marks when the tree was last signed. */
export const MANIFEST_PATH = "public/.well-known/webcat/manifest.json";

/** Everything the signing step writes, staged together after a signature. */
export const ARTIFACT_DIR = "public/.well-known/webcat";

/**
 * Set on the push this hook makes itself, so the pre-push hook that push
 * fires returns immediately instead of asking about a signature it just made.
 */
export const PUSH_GUARD = "WEBCAT_SIGN_GATE_PUSHING";

/**
 * Exit code meaning "stop the push on purpose". Any other non-zero exit is a
 * broken gate, and `.githooks/pre-push` lets those through: a reminder that
 * crashes must not be able to wedge a push.
 */
export const ABORT = 10;

/**
 * Paths that cannot change a byte of `dist/`, so cannot invalidate a
 * signature. Deliberately short: a wrong "no need to sign" ships a broken
 * site, while a needless prompt costs one keystroke. Anything not listed here
 * counts, including `scripts/` (scripts/wasmDigests.mts feeds the build) and
 * `server/` (it shares `lib/` with the client bundle).
 */
export const NON_BUILD_PATTERNS = [
  /^[^/]*\.md$/i,
  /^LICENSE$/,
  /^\.github\//,
  /^\.claude\//,
  /^\.githooks\//,
  /^\.gitignore$/,
];

export function isNonBuildPath(file) {
  return NON_BUILD_PATTERNS.some((re) => re.test(file));
}

export function buildFilesOnly(files) {
  return files.filter((f) => f && !isNonBuildPath(f));
}

const ZERO_SHA = /^0+$/;

/**
 * git feeds a pre-push hook one line per ref:
 *   <local ref> <local sha> <remote ref> <remote sha>
 * A deletion has an all-zero local sha and nothing to sign.
 */
export function parsePushRefs(stdinText) {
  return (stdinText ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [localRef, localSha, remoteRef, remoteSha] = line.split(/\s+/);
      return { localRef, localSha, remoteRef, remoteSha };
    });
}

/** The ref of this push that lands on the deploy branch, if any. */
export function deployRefUpdate(refs) {
  return (
    refs.find(
      (r) => r.remoteRef === DEPLOY_REF && r.localSha && !ZERO_SHA.test(r.localSha),
    ) ?? null
  );
}

/**
 * How the answer to a [Y/n] prompt is read. Anything other than an explicit
 * no counts as yes, including a bare Enter. A null answer (no terminal, or
 * EOF instead of a keystroke) is not an answer and is handled by the caller.
 */
export function isDecline(answer) {
  return /^n(o)?$/i.test((answer ?? "").trim());
}

/** Same, inverted, for prompts that default to no. */
export function isAccept(answer) {
  return /^y(es)?$/i.test((answer ?? "").trim());
}

const useColor = process.stderr.isTTY && !process.env.NO_COLOR;
const c = (code, s) => (useColor ? `\u001b[${code}m${s}\u001b[0m` : s);
const bold = (s) => c("1", s);
const dim = (s) => c("2", s);
const green = (s) => c("32", s);
const yellow = (s) => c("33", s);
const cyan = (s) => c("36", s);
/**
 * Everything goes to stderr. git shows both, but stdout from a hook is the
 * channel tools sometimes capture, and this is a message for a human.
 */
const say = (s = "") => process.stderr.write(`${s}\n`);

function git(args) {
  const res = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  return res.status === 0 ? (res.stdout ?? "").trim() : null;
}

/**
 * Is there a human at this push?
 *
 * `/dev/tty` can often be opened even when nobody is watching (an agent or a
 * wrapper running git with its output piped), and a blocking read there hangs
 * the push with the question scrolled off somewhere invisible. The hook's own
 * stderr is the honest signal: git inherits it, so it is a terminal exactly
 * when the output is going somewhere a person can see.
 */
function isInteractive() {
  if (process.env.CI) return false;
  return Boolean(process.stderr.isTTY || process.stdout.isTTY);
}

/**
 * Read one line from the controlling terminal.
 *
 * Not stdin: git uses that to hand this hook the ref list. `/dev/tty` is the
 * terminal the human is actually sitting at. Returns null when there is not
 * one, which callers treat as "warn, do not ask".
 */
function askTty(question) {
  if (!isInteractive()) return null;
  let fd;
  try {
    fd = openSync("/dev/tty", "r");
  } catch {
    return null;
  }
  try {
    process.stderr.write(question);
    const buf = Buffer.alloc(1);
    let line = "";
    let sawNewline = false;
    for (;;) {
      let n;
      try {
        n = readSync(fd, buf, 0, 1, null);
      } catch (err) {
        if (err.code === "EAGAIN") continue;
        return null;
      }
      if (n === 0) break; // EOF: the terminal went away mid-question.
      if (buf.toString("utf8") === "\n") {
        sawNewline = true;
        break;
      }
      line += buf.toString("utf8");
    }
    say();
    // A bare EOF is not an answer, and must not be read as agreement.
    if (!sawNewline && line === "") return null;
    return line.trim();
  } finally {
    closeSync(fd);
  }
}

/**
 * What is unsigned about the commit being pushed.
 *
 * Not "what is in this push": the question is whether the *tree* being pushed
 * carries a manifest that describes it. So find the last commit that touched
 * the manifest, and look at what changed since. That stays correct whether the
 * unsigned change is in this push or was pushed last week, and it goes quiet
 * on its own once a signature lands on top.
 */
function unsignedChanges(sha) {
  const signedAt = git(["rev-list", "-1", sha, "--", MANIFEST_PATH]);
  if (!signedAt) {
    return { signedAt: null, files: ["<never signed>"], when: null };
  }
  const diff = git(["diff", "--name-only", `${signedAt}..${sha}`]);
  // git failing here is not a licence to stay quiet: ask.
  const files = diff === null ? ["<unknown>"] : buildFilesOnly(diff.split("\n"));
  const when = git(["log", "-1", "--format=%cr", signedAt]);
  return { signedAt, files, when };
}

/** Tracked build files modified in the working tree, which signing would capture. */
function dirtyBuildFiles() {
  const out = git(["status", "--porcelain", "--untracked-files=no"]);
  if (!out) return [];
  const files = out
    .split("\n")
    .map((line) => line.slice(3).trim())
    // A rename shows as "old -> new"; the new path is what a build would see.
    .map((p) => (p.includes(" -> ") ? p.split(" -> ")[1] : p))
    .filter(Boolean);
  return buildFilesOnly(files);
}

/**
 * Run a child that a human has to interact with, on the terminal.
 *
 * This hook's own stdin is the ref list git piped in, so children inherit
 * something already at EOF. Both children here need better than that:
 * webcat-sign.mjs asks for an Enter and then waits on a PIN dialog and a
 * touch, and `git commit` runs the commit hooks, which may have questions of
 * their own. Their output has to be inherited too, or a prompt lands in a pipe
 * nobody is reading and the whole thing looks hung.
 */
function runOnTerminal(cmd, args, env = {}) {
  let ttyFd;
  try {
    ttyFd = openSync("/dev/tty", "r");
  } catch {
    return { ok: false, reason: "no terminal available" };
  }
  try {
    const res = spawnSync(cmd, args, {
      cwd: ROOT,
      stdio: [ttyFd, "inherit", "inherit"],
      env: { ...process.env, ...env },
    });
    if (res.error) return { ok: false, reason: res.error.message };
    return { ok: res.status === 0, reason: `exited with ${res.status}` };
  } finally {
    closeSync(ttyFd);
  }
}

function runSigning() {
  return runOnTerminal(process.execPath, [path.join(ROOT, "scripts/webcat-sign.mjs")]);
}

/**
 * The refspecs that reproduce the push git was about to make, with the deploy
 * branch resolved fresh so it carries the signature commit.
 *
 * Other refs are pinned to the sha git already resolved, so a push of several
 * branches at once sends exactly what was asked for and nothing that moved in
 * the meantime. A zero local sha is a deletion, which is a bare `:ref`.
 */
export function pushRefspecs(refs, deployUpdate) {
  return refs.map((r) => {
    if (deployUpdate && r.remoteRef === deployUpdate.remoteRef) {
      // By name, not by sha: the local ref has moved on to the new commit.
      return `${r.localRef}:${r.remoteRef}`;
    }
    if (!r.localSha || ZERO_SHA.test(r.localSha)) return `:${r.remoteRef}`;
    return `${r.localSha}:${r.remoteRef}`;
  });
}

/**
 * Push what the outer push was going to push, now that the signature is in it.
 *
 * git hands the hook the remote name and URL as argv. The push runs on the
 * terminal because it can need a passphrase, a touch, or a 2FA answer, and it
 * carries a guard so the pre-push hook it fires does not walk back in here.
 */
function pushSigned(refs, update) {
  const remote = process.argv[2];
  if (!remote) return { ok: false, reason: "git named no remote" };

  const refspecs = pushRefspecs(refs, update);
  const res = runOnTerminal("git", ["push", remote, ...refspecs], {
    [PUSH_GUARD]: "1",
  });
  if (!res.ok) return res;
  return {
    ok: true,
    what: `${refspecs.join(", ")} to ${remote}`,
  };
}

function commitArtifacts() {
  if (git(["add", "--", ARTIFACT_DIR]) === null) {
    return { ok: false, reason: `could not stage ${ARTIFACT_DIR}` };
  }
  const staged = git(["diff", "--cached", "--name-only", "--", ARTIFACT_DIR]);
  if (!staged) {
    // Signing rewrote nothing. Odd, but not something to invent a commit for.
    return { ok: true, sha: null };
  }
  const committed = runOnTerminal("git", ["commit", "-m", "Update webcat"]);
  if (!committed.ok) {
    return { ok: false, reason: `git commit ${committed.reason}` };
  }
  return { ok: true, sha: git(["rev-parse", "--short", "HEAD"]) };
}

// Padded on visible width, so box content stays uncoloured and only the frame
// is coloured. Same trick as scripts/webcat-sign.mjs.
const W = 64;
const rule = (l, r) => yellow(`  ${l}${"─".repeat(W)}${r}`);
const row = (s) => `${yellow("  │")}${s.padEnd(W)}${yellow("│")}`;

function unsignedWarning() {
  say(yellow(bold("  Pushing unsigned. Until you sign and push again:")));
  say();
  say(`    ${yellow("•")} riskmapper.app ${bold("will not load")} for anyone running the WEBCAT`);
  say("      extension. It refuses bytes that disagree with the signed");
  say("      manifest, and the breakage is invisible to everyone who is");
  say("      not running it, including you.");
  say(`    ${yellow("•")} The deploy will not promote either: /api/healthz returns 503`);
  say("      on a manifest mismatch, so Railway keeps the previous version");
  say("      and the change never ships.");
  say();
  say(dim("  When you are ready:  yarn webcat:sign"));
  say(dim("  then commit public/.well-known/webcat/ and push again."));
  say();
}

function main() {
  if ((process.env.WEBCAT_SIGN_REMINDER ?? "").toLowerCase() === "off") return 0;
  // The push this hook makes after signing. It is the signed one by
  // construction, and re-entering here would be an infinite regress.
  if (process.env[PUSH_GUARD]) return 0;

  let stdinText = "";
  try {
    stdinText = readFileSync(0, "utf8");
  } catch {
    stdinText = "";
  }

  const refs = parsePushRefs(stdinText);
  const update = deployRefUpdate(refs);
  if (!update) return 0;

  const { files, when } = unsignedChanges(update.localSha);
  if (files.length === 0) return 0;

  const dirty = dirtyBuildFiles();

  say();
  say(rule("┌", "┐"));
  say(row("  This push needs a WEBCAT signature."));
  say(rule("├", "┤"));
  say(row(`  ${files.length} file(s) change what dist/ serves since the last`));
  say(row(`  signature${when ? `, ${when}` : " (never signed)"}, so the manifest you are`));
  say(row("  pushing does not describe the site you are pushing."));
  say(rule("└", "┘"));
  say();

  if (dirty.length > 0) {
    // Signing hashes a build of the working tree, so an uncommitted change
    // would end up inside a signature for commits that do not contain it.
    say(yellow(`  Cannot sign right now: ${dirty.length} build file(s) are modified`));
    say(yellow("  but not committed, and signing hashes a build of the working"));
    say(yellow("  tree. The signature would describe bytes you are not pushing."));
    say();
    say(dim("  Commit or stash them, then push again."));
    say();
    const answer = askTty(`  ${bold("Push unsigned anyway?")} [y/N] `);
    if (answer === null) {
      say(dim("  No terminal to ask at. Stopping the push."));
      say();
      return ABORT;
    }
    if (!isAccept(answer)) {
      say(dim("  Push stopped. Nothing was sent."));
      say();
      return ABORT;
    }
    unsignedWarning();
    return 0;
  }

  const answer = askTty(
    `  ${bold("Sign it now?")} ${dim("(plug in the YubiKey: PIN, then tap)")} [Y/n] `,
  );

  if (answer === null) {
    say(dim("  No terminal to ask at, so this is a reminder only:"));
    say(dim("  run yarn webcat:sign and push the result before this deploys."));
    say();
    return 0;
  }

  if (isDecline(answer)) {
    unsignedWarning();
    return 0;
  }

  say(cyan("  Running yarn webcat:sign. This builds the site, so give it a minute."));
  say();
  const signed = runSigning();
  if (!signed.ok) {
    say();
    say(yellow(`  Signing did not finish (${signed.reason}).`));
    say(dim("  Nothing was pushed. Fix it and push again, or push with"));
    say(dim("  WEBCAT_SIGN_REMINDER=off if you mean to ship unsigned."));
    say();
    return ABORT;
  }

  const committed = commitArtifacts();
  if (!committed.ok) {
    say();
    say(yellow(`  Signed, but the artifacts are not committed (${committed.reason}).`));
    say(dim(`  Commit ${ARTIFACT_DIR} yourself, then push again.`));
    say();
    return ABORT;
  }

  say();
  say(green(bold("  Signed.")));
  if (committed.sha) {
    say(`  Committed as ${bold(committed.sha)} ${dim('("Update webcat")')}.`);
  } else {
    say(dim("  The artifacts were already up to date, so there was nothing to commit."));
  }
  say();

  // The ref list git is holding was resolved before that commit existed, and
  // it cannot be changed from in here, so this push can never carry the
  // signature. Rather than send the wrong thing or make you type the command
  // again, do the push here, with the signature in it, and stop the outer one.
  const pushed = pushSigned(refs, update);
  if (!pushed.ok) {
    say(yellow(`  The push did not go through (${pushed.reason}).`));
    say(dim("  The signature is committed, so a plain `git push` will send it."));
    say();
    return ABORT;
  }

  say(green(bold("  Pushed, signature included.")));
  say(dim(`  ${pushed.what}`));
  say();
  say(dim("  git will say \"failed to push some refs\" below. That is this hook"));
  say(dim("  stopping the push it was asked about, which had nothing left to"));
  say(dim("  send. Everything is on the remote."));
  say();
  return ABORT;
}

// Only run the hook body when executed directly, so tests can import the
// helpers without tripping a prompt.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  process.exit(main());
}
