import { afterAll, describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const tempDirs: string[] = [];

afterAll(() => {
  for (const dir of tempDirs) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup.
    }
  }
});

const lockUrl = new URL("../src/services/user-profile/learning-lock.js", import.meta.url).href;
const configUrl = new URL("../src/config.js", import.meta.url).href;
const loggerUrl = new URL("../src/services/logger.js", import.meta.url).href;

const LOCK_FILE = ".profile-learning.lock";

function storage(): string {
  const dir = mkdtempSync(join(tmpdir(), "opencode-mem-learning-lock-"));
  tempDirs.push(dir);
  return dir;
}

function preamble(storagePath: string): string {
  return `
import { mock } from "bun:test";
mock.module(${JSON.stringify(configUrl)}, () => ({
  CONFIG: { storagePath: ${JSON.stringify(storagePath)} },
  initConfig: () => {},
  isConfigured: () => true,
}));
mock.module(${JSON.stringify(loggerUrl)}, () => ({ log: () => {} }));
const lock = await import(${JSON.stringify(lockUrl)});
`;
}

function runScript(dir: string, name: string, body: string) {
  const scriptPath = join(dir, name);
  writeFileSync(scriptPath, body);
  const result = Bun.spawnSync({
    cmd: [process.execPath, scriptPath],
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = Buffer.from(result.stdout).toString("utf8").trim();
  return {
    exitCode: result.exitCode,
    stderr: Buffer.from(result.stderr).toString("utf8").trim(),
    stdout,
    parsed: stdout ? JSON.parse(stdout) : null,
  };
}

/**
 * Spawns two real processes that contend for the lock at the same time.
 *
 * Both wait on a shared start barrier before acquiring, so the acquisitions
 * genuinely overlap. Running two promises in one process would only exercise the
 * in-process guard and would pass even with no cross-process lock at all.
 */
function runContention(storagePath: string, barrierPath: string) {
  const worker = (label: string) => `
${preamble(storagePath)}
import { existsSync, writeFileSync, readFileSync } from "node:fs";

writeFileSync(${JSON.stringify(barrierPath)} + ".${label}", "ready");
const peers = ["a", "b"].map((p) => ${JSON.stringify(barrierPath)} + "." + p);
const deadline = Date.now() + 10_000;
while (Date.now() < deadline && !peers.every((p) => existsSync(p))) {
  await new Promise((r) => setTimeout(r, 5));
}

const release = lock.tryAcquireProfileLearningLock("/project-${label}");
if (release) {
  // Hold the lock long enough that the peer's attempt provably overlaps.
  await new Promise((r) => setTimeout(r, 600));
  release();
}
console.log(JSON.stringify({ acquired: release !== null }));
`;

  const dir = storagePath;
  writeFileSync(join(dir, "worker-a.mjs"), worker("a"));
  writeFileSync(join(dir, "worker-b.mjs"), worker("b"));

  const spawn = (file: string) =>
    Bun.spawn({
      cmd: [process.execPath, join(dir, file)],
      stdout: "pipe",
      stderr: "pipe",
    });

  const a = spawn("worker-a.mjs");
  const b = spawn("worker-b.mjs");
  return Promise.all(
    [a, b].map(async (proc) => {
      const out = (await new Response(proc.stdout).text()).trim();
      await proc.exited;
      return out ? (JSON.parse(out) as { acquired: boolean }) : null;
    })
  );
}

describe("cross-process profile learning lock", () => {
  it("grants the lock to exactly one of two concurrent processes", async () => {
    const dir = storage();
    const results = await runContention(dir, join(dir, "barrier"));

    const granted = results.filter((r) => r?.acquired).length;
    expect(results).toHaveLength(2);
    expect(granted).toBe(1);
  }, 45_000);

  it("releases the lock so a later process can acquire it", () => {
    const dir = storage();

    const first = runScript(
      dir,
      "acquire-release.mjs",
      `
${preamble(dir)}
const release = lock.tryAcquireProfileLearningLock("/project-a");
release?.();
const second = lock.tryAcquireProfileLearningLock("/project-a");
console.log(JSON.stringify({ first: release !== null, second: second !== null }));
second?.();
`
    );

    expect(first.exitCode).toBe(0);
    expect(first.parsed).toEqual({ first: true, second: true });
    expect(existsSync(join(dir, LOCK_FILE))).toBe(false);
  }, 20_000);

  it("reclaims a lock whose holder process no longer exists", () => {
    const dir = storage();
    // PID 2^22 is above every Linux/macOS pid_max default, so it cannot be live.
    writeFileSync(
      join(dir, LOCK_FILE),
      JSON.stringify({ pid: 4194304, acquiredAt: Date.now(), directory: "/dead" })
    );

    const result = runScript(
      dir,
      "reclaim-dead.mjs",
      `
${preamble(dir)}
const release = lock.tryAcquireProfileLearningLock("/project-a");
console.log(JSON.stringify({ acquired: release !== null }));
release?.();
`
    );

    expect(result.exitCode).toBe(0);
    expect(result.parsed).toEqual({ acquired: true });
  }, 20_000);

  it("reclaims a lock held past the staleness deadline", () => {
    const dir = storage();
    writeFileSync(
      join(dir, LOCK_FILE),
      JSON.stringify({
        pid: process.pid,
        acquiredAt: Date.now() - 31 * 60 * 1000,
        directory: "/stalled",
      })
    );

    const result = runScript(
      dir,
      "reclaim-stale.mjs",
      `
${preamble(dir)}
const release = lock.tryAcquireProfileLearningLock("/project-a");
console.log(JSON.stringify({ acquired: release !== null }));
release?.();
`
    );

    expect(result.exitCode).toBe(0);
    expect(result.parsed).toEqual({ acquired: true });
  }, 20_000);

  it("does not steal a lock file that is still being written", () => {
    const dir = storage();
    // A truncated file is what a reader can observe between the `wx` create and
    // the content write. Reclaiming it immediately would hand the lock to a
    // second process while the first believes it holds it.
    writeFileSync(join(dir, LOCK_FILE), "{");

    const result = runScript(
      dir,
      "write-window.mjs",
      `
${preamble(dir)}
const release = lock.tryAcquireProfileLearningLock("/project-a");
console.log(JSON.stringify({ acquired: release !== null }));
release?.();
`
    );

    expect(result.exitCode).toBe(0);
    expect(result.parsed).toEqual({ acquired: false });
  }, 20_000);

  it("reclaims a corrupt lock file once the write window has passed", () => {
    const dir = storage();
    const lockFile = join(dir, LOCK_FILE);
    writeFileSync(lockFile, "{");
    const stale = new Date(Date.now() - 60_000);
    // Backdate past WRITE_WINDOW_MS so the file reads as corrupt, not mid-write.
    utimesSync(lockFile, stale, stale);

    const result = runScript(
      dir,
      "corrupt-expired.mjs",
      `
${preamble(dir)}
const release = lock.tryAcquireProfileLearningLock("/project-a");
console.log(JSON.stringify({ acquired: release !== null }));
release?.();
`
    );

    expect(result.exitCode).toBe(0);
    expect(result.parsed).toEqual({ acquired: true });
  }, 20_000);

  it("keeps a live holder's lock and records its identity", () => {
    const dir = storage();

    const result = runScript(
      dir,
      "held.mjs",
      `
${preamble(dir)}
import { readFileSync } from "node:fs";
const release = lock.tryAcquireProfileLearningLock("/project-a");
console.log(JSON.stringify({
  held: lock.isProfileLearningLockHeld(),
  pid: JSON.parse(readFileSync(${JSON.stringify(join(dir, LOCK_FILE))}, "utf-8")).pid === process.pid,
}));
release?.();
`
    );

    expect(result.exitCode).toBe(0);
    expect(result.parsed).toEqual({ held: true, pid: true });
  }, 20_000);

  it("does not release a lock that now belongs to another process", () => {
    const dir = storage();
    const lockFile = join(dir, LOCK_FILE);

    const result = runScript(
      dir,
      "foreign-release.mjs",
      `
${preamble(dir)}
import { writeFileSync } from "node:fs";
const release = lock.tryAcquireProfileLearningLock("/project-a");
// Simulate the lock having been reclaimed by a different live process.
writeFileSync(${JSON.stringify(lockFile)}, JSON.stringify({
  pid: 4194304, acquiredAt: Date.now(), directory: "/other",
}));
release?.();
console.log(JSON.stringify({ stillPresent: true }));
`
    );

    expect(result.exitCode).toBe(0);
    expect(readFileSync(lockFile, "utf-8")).toContain("4194304");
  }, 20_000);
});
