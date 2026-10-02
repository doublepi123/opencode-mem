/**
 * Cross-process worker for tests/profile-learning-lock.test.ts.
 *
 * Runs in a real separate process with CONFIG.storagePath mocked to a temp
 * directory, so it never touches the real memory database. All coordination
 * with the test parent uses explicit barrier files under the storage dir —
 * never sleeps — and every wait is bounded so a broken handshake fails fast
 * instead of hanging the suite.
 *
 * Env contract:
 *   PLL_STORAGE  temp storage path (also hosts the coordination DB + barriers)
 *   PLL_MODE     one of the modes below
 *
 * Modes:
 *   hold          acquire; signal hs.acquired; wait hs.release; release;
 *                 report held-before/after-release
 *   try           wait hs.acquired (winner confirmed holding), attempt acquire,
 *                 release immediately if won, report outcome
 *   hold-forever  acquire; signal hs.acquired; wait until killed (SIGKILL test)
 *   probe         single acquire attempt (live/EPERM/backdated/reuse/malformed/
 *                 db-error scenarios); release if acquired
 *   proc-probe    plant owner with pid whose /proc is absent (2^22), then
 *                 force kill(0) outcome via PLL_FORCE_KILL env (EPERM|OK|ESRCH);
 *                 report acquire result. EPERM injected by stubbing
 *                 process.kill in-process — NOT by relying on PID 1 as root.
 *   boot-variants  plant owner rows one at a time (valid-null, invalid-string,
 *                 number, object, same-as-host) and report acquire result for
 *                 each, releasing between attempts.
 *   cas-race      signal hs.ready.<label>; wait hs.go; attempt acquire
 *   stale-release acquire; flip owner_token to a simulated same-PID new owner;
 *                 call the OLD release; report whether the row survived
 *   release-twice acquire; release; release again; report idempotency
 */
import { mock } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import * as importedFs from "node:fs";
import * as importedChildProcess from "node:child_process";
import * as importedLibsql from "@libsql/client";

const storage = process.env.PLL_STORAGE;
const mode = process.env.PLL_MODE;
const label = process.env.PLL_LABEL ?? "x";
if (!storage || !mode) {
  console.error("PLL_STORAGE and PLL_MODE are required");
  process.exit(2);
}

// Captured BEFORE any mock.module call: once "node:fs" / "@libsql/client"
// are mocked, re-importing them inside a factory would resolve the mock and
// recurse. These constants pin the real live bindings for the wrappers.
const realReadFileSync = importedFs.readFileSync;
const realSpawnSync = importedChildProcess.spawnSync;
const realCreateClient = importedLibsql.createClient;

const configUrl = new URL("../../src/config.js", import.meta.url).href;
const loggerUrl = new URL("../../src/services/logger.js", import.meta.url).href;
const lockUrl = new URL("../../src/services/user-profile/learning-lock.js", import.meta.url).href;

mock.module(configUrl, () => ({
  CONFIG: { storagePath: storage },
  initConfig: () => {},
  isConfigured: () => true,
}));
mock.module(loggerUrl, () => ({ log: () => {} }));

// current-boot-invalid: the LOCAL machine's boot identity reads as garbage.
// The implementation must treat the local boot id as "unknown" and never use
// it as a dead signal, even against a well-formed foreign boot id. Mocks must
// be registered before learning-lock.js is imported (covers Linux /proc and
// Darwin sysctl).
if (mode === "current-boot-invalid") {
  mock.module("node:fs", () => ({
    ...importedFs,
    readFileSync: (path: any, options: any) =>
      path === "/proc/sys/kernel/random/boot_id"
        ? "not-a-boot-id"
        : realReadFileSync(path, options),
  }));
  mock.module("node:child_process", () => ({
    ...importedChildProcess,
    spawnSync: (command: any, args?: any, options?: any) => {
      if (
        command === "sysctl" &&
        Array.isArray(args) &&
        args[0] === "-n" &&
        args[1] === "kern.boottime"
      ) {
        return {
          status: 0,
          stdout: "garbage-boot-identity",
          stderr: "",
          pid: 0,
          output: [],
          signal: null,
        };
      }
      return realSpawnSync(command, args, options);
    },
  }));
}
// cas-race: wrap the REAL @libsql/client so both competitors provably act
// on the same stale SELECT snapshot. The wrapper records the owner_token
// each side's SELECT observed, and parks each side's UPDATE (the CAS)
// behind a parent-controlled file gate. SQL execution stays 100% real;
// only the interleaving is staged. Registered before learning-lock.js is
// imported so the module under test picks up the wrapped client.
let casSeenToken: string | null = null;
let casLabel = "";
if (mode === "cas-race") {
  casLabel = label;
  mock.module("@libsql/client", () => ({
    ...importedLibsql,
    createClient: (opts: any) => {
      const client = realCreateClient(opts);
      return {
        ...client,
        execute: async (stmt: any) => {
          const sql: string = typeof stmt === "string" ? stmt : stmt.sql;
          if (/^UPDATE\s+profile_learning_lock/i.test(sql)) {
            // Both sides have read the same stale row; announce it and
            // wait for the parent's gate before the CAS fires.
            signal(barrier(`seen.${casLabel}`));
            await waitFile(barrier("go.update"));
          }
          const result = await client.execute(stmt);
          const after: string = typeof stmt === "string" ? stmt : stmt.sql;
          if (/^SELECT\s+owner_token/i.test(after)) {
            const row = result.rows[0] as Record<string, unknown> | undefined;
            casSeenToken = row ? String(row["owner_token"]) : null;
            writeFileSync(barrier(`token.${casLabel}`), casSeenToken ?? "none");
          }
          return result;
        },
        close: () => client.close(),
      };
    },
  }));
}
const lock = await import(lockUrl);

const barrier = (name: string) => join(storage, `hs.${name}`);
const WAIT_MS = 30_000;

async function waitFile(path: string): Promise<void> {
  const deadline = Date.now() + WAIT_MS;
  while (!existsSync(path)) {
    if (Date.now() > deadline) throw new Error(`barrier timeout: ${path}`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

function signal(path: string): void {
  writeFileSync(path, "ready");
}

function out(payload: Record<string, unknown>): void {
  console.log(JSON.stringify(payload));
}

async function openDb() {
  const client = realCreateClient({
    url: `file:${join(storage, ".profile-learning-coordination.db")}`,
  });
  await client.execute("PRAGMA busy_timeout = 5000");
  return client;
}

try {
  switch (mode) {
    case "hold": {
      const release = await lock.tryAcquireProfileLearningLock("/project-hold");
      if (!release) {
        out({ acquired: false });
        break;
      }
      const heldBefore = await lock.isProfileLearningLockHeld();
      signal(barrier("acquired"));
      await waitFile(barrier("release"));
      await release();
      const heldAfter = await lock.isProfileLearningLockHeld();
      out({ acquired: true, heldBefore, heldAfter });
      break;
    }

    case "try": {
      // Do not attempt until the winner has confirmed it is holding; the
      // parent only writes hs.release after this process exits, so the
      // attempts provably overlap the winner's hold.
      await waitFile(barrier("acquired"));
      const release = await lock.tryAcquireProfileLearningLock("/project-try");
      out({ acquired: release !== null });
      if (release) await release();
      break;
    }

    case "hold-forever": {
      const release = await lock.tryAcquireProfileLearningLock("/project-forever");
      if (!release) {
        out({ acquired: false });
        break;
      }
      signal(barrier("acquired"));
      // Hold until the parent SIGKILLs this process; never release.
      await waitFile(barrier("never"));
      await release();
      break;
    }

    case "probe": {
      const release = await lock.tryAcquireProfileLearningLock("/project-probe");
      out({ acquired: release !== null });
      if (release) await release();
      break;
    }

    case "cas-race": {
      signal(barrier(`ready.${label}`));
      await waitFile(barrier("go"));
      // Inside acquire (wrapped @libsql/client): INSERT fails → SELECT reads
      // the stale row (wrapper writes token.<label>) → UPDATE parks on the
      // parent's go.update gate, so both CAS attempts are provably against
      // the same observed stale token before either fires.
      const release = await lock.tryAcquireProfileLearningLock("/project-race");
      signal(barrier(`attempted.${label}`));
      out({ acquired: release !== null });
      if (release) {
        const peer = label === "a" ? "b" : "a";
        await waitFile(barrier(`attempted.${peer}`));
        await release();
      }
      break;
    }

    case "proc-probe": {
      // Owner pid is 2^22 (above every default pid_max → /proc absent). The
      // kill(0) outcome is forced via PLL_LABEL (EPERM | OK | ESRCH),
      // stubbed in-process — never by relying on PID 1 as root.
      const forced = label;
      if (forced === "EPERM" || forced === "OK" || forced === "ESRCH") {
        const realKill = process.kill.bind(process);
        process.kill = ((pid: number, signal?: number | string) => {
          if (pid === 4194304) {
            if (forced === "EPERM") {
              const e = new Error(`kill EPERM`) as NodeJS.ErrnoException;
              e.code = "EPERM";
              throw e;
            }
            if (forced === "ESRCH") {
              const e = new Error(`kill ESRCH`) as NodeJS.ErrnoException;
              e.code = "ESRCH";
              throw e;
            }
            return;
          }
          return realKill(pid, signal);
        }) as typeof process.kill;
      }
      const release = await lock.tryAcquireProfileLearningLock("/project-probe");
      out({ forced, acquired: release !== null });
      if (release) await release();
      break;
    }

    case "boot-variants": {
      // For each variant: plant the owner row, attempt acquire, release if
      // won. Verifies malformed boot_id fails closed while valid-null and
      // same-as-host remain live (no reclaim), all with starttime set to
      // this process's real starttime (a live, identity-verifiable owner).
      const { getProfileLearningBootId, getProfileLearningStarttime } = await import(lockUrl);
      const ownStarttime = getProfileLearningStarttime(process.pid);
      const bootFile = getProfileLearningBootId();
      if (!ownStarttime || !bootFile) {
        console.error("boot-variants requires local boot + starttime identity");
        process.exit(1);
      }
      const variants: Array<{ name: string; bootId: unknown; useRawSql?: string }> = [
        { name: "validNull", bootId: null },
        { name: "invalidString", bootId: "not-a-boot-id" },
        { name: "number", bootId: 12345 },
        // A non-string, non-null value cannot arrive via bind parameters, so
        // plant it as a BLOB: it reads back as a byte array, exercising the
        // "object-like" non-string branch of the validator.
        {
          name: "object",
          bootId: null,
          useRawSql: 'CAST(\'{"v":"x"}\' AS BLOB)',
        },
        { name: "sameAsHost", bootId: bootFile },
      ];
      const results: Record<string, boolean> = {};
      for (const v of variants) {
        const db = await openDb();
        try {
          await db.execute(`CREATE TABLE IF NOT EXISTS profile_learning_lock (
            name TEXT PRIMARY KEY,
            owner_token TEXT NOT NULL,
            pid INTEGER NOT NULL,
            boot_id TEXT,
            starttime TEXT,
            acquired_at INTEGER NOT NULL
          )`);
          // This worker process IS alive with a verifiable identity, so any
          // no-reclaim outcome proves the live check worked rather than a
          // parse refusal.
          if (v.useRawSql !== undefined) {
            await db.execute(`INSERT OR REPLACE INTO profile_learning_lock
                    (name, owner_token, pid, boot_id, starttime, acquired_at)
                  VALUES ('profile-learning', 'planted-${v.name}', ${process.pid}, ${v.useRawSql}, '${ownStarttime}', ${Date.now()})`);
          } else {
            await db.execute({
              sql: `INSERT OR REPLACE INTO profile_learning_lock
                    (name, owner_token, pid, boot_id, starttime, acquired_at)
                  VALUES ('profile-learning', 'planted-${v.name}', ?, ?, ?, ?)`,
              args: [process.pid, v.bootId, ownStarttime, Date.now()],
            });
          }
        } finally {
          db.close();
        }
        const release = await lock.tryAcquireProfileLearningLock("/project-boot");
        results[v.name] = release !== null;
        if (release) await release();
      }
      out({ variants: results });
      break;
    }

    case "current-boot-invalid": {
      // node:fs was mocked at module top (mode === "current-boot-invalid")
      // so the LOCAL boot_id reads as garbage. The planted owner is THIS
      // live worker (signal-probe OK), with a well-formed FOREIGN boot id
      // and no starttime — boot comparison is the only possible dead
      // signal, and an untrusted local boot id must never fire it.
      const db = await openDb();
      try {
        await db.execute(`CREATE TABLE IF NOT EXISTS profile_learning_lock (
          name TEXT PRIMARY KEY,
          owner_token TEXT NOT NULL,
          pid INTEGER NOT NULL,
          boot_id TEXT,
          starttime TEXT,
          acquired_at INTEGER NOT NULL
        )`);
        await db.execute({
          sql: `INSERT OR REPLACE INTO profile_learning_lock
                  (name, owner_token, pid, boot_id, starttime, acquired_at)
                VALUES ('profile-learning', 'planted-other-boot', ?, '11111111-2222-3333-4444-555555555555', NULL, ?)`,
          args: [process.pid, Date.now()],
        });
      } finally {
        db.close();
      }
      const release = await lock.tryAcquireProfileLearningLock("/project-boot");
      out({ acquired: release !== null });
      if (release) await release();
      break;
    }

    case "stale-release": {
      const release = await lock.tryAcquireProfileLearningLock("/project-stale");
      if (!release) {
        out({ acquired: false, stillHeld: null });
        break;
      }
      // Simulate ownership having moved on with the SAME pid but a fresh
      // token (e.g. re-claim after our death followed by pid reuse, or a
      // supervisor respawning us). The old release must not drop that row.
      const db = await openDb();
      try {
        await db.execute({
          sql: `UPDATE profile_learning_lock SET owner_token = 'simulated-new-owner-token'
                WHERE name = 'profile-learning'`,
        });
      } finally {
        db.close();
      }
      await release();
      const stillHeld = await lock.isProfileLearningLockHeld();
      out({ acquired: true, stillHeld });
      break;
    }

    case "release-twice": {
      const release = await lock.tryAcquireProfileLearningLock("/project-twice");
      if (!release) {
        out({ acquired: false });
        break;
      }
      await release();
      await release(); // Must be a no-op, not an error.
      out({ acquired: true, heldAfter: await lock.isProfileLearningLockHeld() });
      break;
    }

    default: {
      console.error(`unknown PLL_MODE: ${mode}`);
      process.exit(2);
    }
  }
} catch (error) {
  out({ error: String(error) });
  process.exit(1);
}
