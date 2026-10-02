import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { CONFIG } from "../../config.js";
import { log } from "../logger.js";

/**
 * Standalone coordination database (SQLite via @libsql/client) inside
 * CONFIG.storagePath. It is deliberately separate from the memory database:
 * every statement here is short and autonomous, and no transaction is ever
 * held across the LLM round trip, so lock traffic cannot block normal memory
 * database work.
 */
export const PROFILE_LEARNING_COORDINATION_DB = ".profile-learning-coordination.db";

/** Single logical lock — the table only ever holds this one row. */
const LOCK_NAME = "profile-learning";

/** Bounded wait so a contended coordination DB cannot hang an idle handler. */
const BUSY_TIMEOUT_MS = 5_000;

interface ProcessIdentity {
  pid: number;
  bootId: string | null;
  starttime: string | null;
}

interface ValidOwner {
  ownerToken: string;
  pid: number;
  bootId: string | null;
  starttime: string | null;
}

type ProcStatResult =
  { status: "ok"; starttime: string } | { status: "absent" } | { status: "unreadable" };

/** Linux boot_id is a lowercase UUID printed by the kernel. */
const LINUX_BOOT_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Darwin boot identity derived from kern.boottime seconds. */
const DARWIN_BOOT_ID_PATTERN = /^darwin-boot-\d+$/;

function isKnownBootId(value: string): boolean {
  return LINUX_BOOT_ID_PATTERN.test(value) || DARWIN_BOOT_ID_PATTERN.test(value);
}

/** Cached for the process lifetime — boot identity cannot change without a reboot. */
let cachedBootId: string | null | undefined;

function coordinationDbPath(): string {
  return resolve(CONFIG.storagePath || "", PROFILE_LEARNING_COORDINATION_DB);
}

/**
 * Opens the coordination database, guarantees the lock table exists, runs the
 * callback, and always closes the handle. One handle per operation; nothing is
 * cached across the LLM round trip.
 */
async function withCoordinationDb<T>(fn: (client: Client) => Promise<T>): Promise<T> {
  const dbPath = coordinationDbPath();
  try {
    mkdirSync(dirname(dbPath), { recursive: true });
  } catch {
    // Already exists, or the statements below will fail loudly on their own.
  }
  const client = createClient({ url: `file:${dbPath}` });
  try {
    await client.execute(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
    await client.execute(`CREATE TABLE IF NOT EXISTS profile_learning_lock (
      name TEXT PRIMARY KEY,
      owner_token TEXT NOT NULL,
      pid INTEGER NOT NULL,
      boot_id TEXT,
      starttime TEXT,
      acquired_at INTEGER NOT NULL
    )`);
    return await fn(client);
  } finally {
    client.close();
  }
}

function rowsAffected(result: { rowsAffected?: number | bigint }): number {
  return Number(result.rowsAffected ?? 0);
}

/**
 * Reads the machine's current boot id. The value is only used as a dead
 * signal when it matches a known platform format; anything unreadable or
 * malformed is treated as "unknown" and never participates in a dead
 * decision.
 *
 * - Linux: `/proc/sys/kernel/random/boot_id` (UUID)
 * - Darwin: `sysctl kern.boottime` seconds, encoded as `darwin-boot-<sec>`
 */
function readBootIdUncached(): string | null {
  try {
    const value = readFileSync("/proc/sys/kernel/random/boot_id", "utf-8").trim();
    if (LINUX_BOOT_ID_PATTERN.test(value)) return value;
  } catch {
    // Fall through to Darwin / unknown.
  }

  if (process.platform === "darwin") {
    try {
      const result = spawnSync("sysctl", ["-n", "kern.boottime"], {
        encoding: "utf8",
        timeout: 2_000,
      });
      if (result.status === 0 && typeof result.stdout === "string") {
        const match = result.stdout.match(/sec\s*=\s*(\d+)/);
        if (match) {
          const bootId = `darwin-boot-${match[1]}`;
          return DARWIN_BOOT_ID_PATTERN.test(bootId) ? bootId : null;
        }
      }
    } catch {
      return null;
    }
  }

  return null;
}

function readBootId(): string | null {
  if (cachedBootId !== undefined) return cachedBootId;
  cachedBootId = readBootIdUncached();
  return cachedBootId;
}

/**
 * Reads a process starttime identity used for PID-reuse detection.
 *
 * - Linux: field 22 of `/proc/<pid>/stat` (clock ticks since boot)
 * - Darwin: `ps -p <pid> -o lstart=` under LC_ALL=C, stored as unix-ms digits
 *   so the coordination row stays a simple numeric string
 */
function readLinuxProcStat(pid: number): ProcStatResult {
  let stat: string;
  try {
    stat = readFileSync(`/proc/${pid}/stat`, "utf-8");
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === "ENOENT"
      ? { status: "absent" }
      : { status: "unreadable" };
  }
  const commEnd = stat.lastIndexOf(")");
  if (commEnd === -1) {
    return { status: "unreadable" };
  }
  const fields = stat.slice(commEnd + 2).split(" ");
  const starttime = fields[22 - 3];
  return starttime && /^\d+$/.test(starttime)
    ? { status: "ok", starttime }
    : { status: "unreadable" };
}

function readDarwinStarttime(pid: number): ProcStatResult {
  try {
    const result = spawnSync("ps", ["-p", String(pid), "-o", "lstart="], {
      encoding: "utf8",
      timeout: 2_000,
      env: { ...process.env, LC_ALL: "C", LANG: "C" },
    });
    if (result.status !== 0) {
      // ps exits non-zero when the PID is gone (or invalid). Treat as absent
      // so the signal-0 probe can confirm death under hidepid-like cases.
      return { status: "absent" };
    }
    const lstart = typeof result.stdout === "string" ? result.stdout.trim() : "";
    if (!lstart) return { status: "absent" };
    // Store the raw LC_ALL=C lstart text. Do NOT Date.parse — JS date-time
    // parsing without a timezone is implementation-defined and can disagree
    // across bun test vs worker processes (UTC vs local), which would make a
    // live holder look like PID reuse.
    return { status: "ok", starttime: `darwin:${lstart}` };
  } catch {
    return { status: "unreadable" };
  }
}

function readProcStat(pid: number): ProcStatResult {
  if (process.platform === "linux") {
    return readLinuxProcStat(pid);
  }
  if (process.platform === "darwin") {
    return readDarwinStarttime(pid);
  }
  // Other platforms: no starttime identity; dead detection falls back to signals.
  return { status: "unreadable" };
}

function currentProcessIdentity(): ProcessIdentity {
  const own = readProcStat(process.pid);
  return {
    pid: process.pid,
    bootId: readBootId(),
    starttime: own.status === "ok" ? own.starttime : null,
  };
}

function coercePid(value: unknown): number | null {
  if (typeof value === "number" && Number.isInteger(value) && value > 0) {
    return value;
  }
  if (typeof value === "bigint" && value > 0n && Number.isSafeInteger(Number(value))) {
    return Number(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) {
    const pid = Number(value);
    return Number.isInteger(pid) && pid > 0 ? pid : null;
  }
  return null;
}

function coerceOptionalString(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Boot id of a stored owner record. Three distinct states:
 *  - "none"  — column is NULL: legitimately recorded on a platform without
 *              boot identity (conservative signal-probe fallback applies);
 *  - "known" — a well-formed Linux UUID or Darwin `darwin-boot-<sec>` string;
 *  - invalid — anything else (garbage string, number, object, …). Never
 *              null-coerced: an owner whose boot id we cannot interpret is
 *              an untrusted record and the lock is not acquired (fail-closed).
 */
type StoredBootId = { kind: "none" } | { kind: "known"; value: string };

function parseStoredBootId(value: unknown): StoredBootId | null {
  if (value === null) return { kind: "none" };
  if (typeof value === "string" && isKnownBootId(value)) {
    return { kind: "known", value };
  }
  return null;
}

/**
 * Structural validation of the stored owner record. A malformed record is
 * never treated as a free or reclaimable lock (fail-closed): the caller just
 * skips this round instead of potentially stealing a live holder's lock.
 */
function parseOwnerRow(
  row: Record<string, unknown>
): { ok: true; owner: ValidOwner } | { ok: false; reason: string } {
  const ownerToken = coerceOptionalString(row["owner_token"]);
  if (!ownerToken) return { ok: false, reason: "owner_token missing/empty" };

  const pid = coercePid(row["pid"]);
  if (pid === null) return { ok: false, reason: `invalid pid: ${String(row["pid"])}` };

  const storedBootId = parseStoredBootId(row["boot_id"]);
  if (!storedBootId) return { ok: false, reason: `invalid boot_id: ${String(row["boot_id"])}` };
  const bootId = storedBootId.kind === "known" ? storedBootId.value : null;

  let starttime: string | null = null;
  if (row["starttime"] !== null && row["starttime"] !== undefined) {
    const raw = row["starttime"];
    if (typeof raw !== "string" || raw.length === 0 || raw.length > 160) {
      return { ok: false, reason: "invalid starttime" };
    }
    // Linux stores /proc starttime as digits; Darwin stores `darwin:<lstart>`.
    if (!/^\d+$/.test(raw) && !raw.startsWith("darwin:")) {
      return { ok: false, reason: "invalid starttime" };
    }
    starttime = raw;
  }

  const acquiredAt = row["acquired_at"];
  if (
    typeof acquiredAt !== "number" &&
    typeof acquiredAt !== "bigint" &&
    !/^\d+$/.test(String(acquiredAt ?? ""))
  ) {
    return { ok: false, reason: "invalid acquired_at" };
  }

  return { ok: true, owner: { ownerToken, pid, bootId, starttime } };
}

/**
 * True only when the recorded owner is *definitively* gone from this
 * machine's current PID namespace:
 *  - its boot id is a known identity differing from this machine's current
 *    boot id (the holder ran under a previous boot), or
 *  - process starttime is readable and differs (PID reuse), or
 *  - process starttime lookup is absent AND the signal-0 probe returns ESRCH —
 *    hidepid=2 makes a live holder's /proc entry invisible, so ENOENT alone
 *    is never proof of death, or
 *  - (no startup identity recorded) signal 0 returns ESRCH.
 *
 * EPERM means "alive under another uid" and counts as live; any other
 * error means "unknown" and is never a dead signal. Identity we cannot
 * establish is never guessed, and no TTL ever overrides this check.
 *
 * Single-machine view: the coordination DB is expected to be shared only by
 * processes on one host. A record written by a process in another PID
 * namespace is beyond what local process tables can attest and conservatively
 * reads as not-dead.
 */

/**
 * Signal-0 liveness probe. ESRCH is the only "dead" outcome: EPERM means
 * alive under another uid (hidepid=2 or another user), and any other error
 * means "unknown", which is never a dead signal.
 */
function isPidGoneBySignal(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return false;
  } catch (error) {
    return (error as NodeJS.ErrnoException)?.code === "ESRCH";
  }
}

function ownerIsDefinitelyDead(owner: ValidOwner, self: ProcessIdentity): boolean {
  if (self.bootId !== null && owner.bootId !== null && owner.bootId !== self.bootId) {
    return true;
  }

  if (self.starttime !== null && owner.starttime !== null) {
    const stat = readProcStat(owner.pid);
    if (stat.status === "ok") {
      return stat.starttime !== owner.starttime;
    }
    if (stat.status === "absent") {
      // /proc may be hidden (hidepid=2): fall through to the signal probe
      // instead of trusting ENOENT as proof of death.
      return isPidGoneBySignal(owner.pid);
    }
    return false;
  }

  return isPidGoneBySignal(owner.pid);
}

function releaseFn(ownerToken: string): () => Promise<void> {
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await withCoordinationDb(async (client) => {
        await client.execute({
          sql: `DELETE FROM profile_learning_lock WHERE name = ? AND owner_token = ?`,
          args: [LOCK_NAME, ownerToken],
        });
      });
    } catch (error) {
      // The owner row survives; after this process exits another process can
      // reclaim it via the dead-owner CAS path. Never throw out of release.
      log("profile-learning lock: release failed; row will be reclaimed after exit", {
        error: String(error),
      });
    }
  };
}

/**
 * Serializes profile learning across every process sharing this storage path.
 *
 * Ownership is a single row in a standalone SQLite coordination database:
 *  - acquiring is one `INSERT ... ON CONFLICT DO NOTHING` (rowsAffected 1 wins);
 *  - a conflicting row is only taken over with a conditional
 *    `UPDATE ... WHERE owner_token = <old token>` (CAS) when the recorded
 *    owner is provably dead or its original process identity is gone;
 *  - release is `DELETE ... WHERE owner_token = <token>`, so a stale release
 *    from a previous owner (even with a reused PID) can never drop someone
 *    else's lock.
 *
 * Returns a release function, or null when another process holds the lock or
 * the coordination state cannot be trusted (fail-closed) — in both cases the
 * caller must skip this round rather than wait, because the next idle event
 * retries.
 *
 * Service wiring note: this function is async and must be `await`ed by the
 * caller, with the in-process `isLearningRunning` guard set before the first
 * `await`.
 */
export async function tryAcquireProfileLearningLock(
  directory: string
): Promise<(() => Promise<void>) | null> {
  const identity = currentProcessIdentity();
  const ownerToken = randomUUID();

  try {
    return await withCoordinationDb(async (client) => {
      const inserted = await client.execute({
        sql: `INSERT INTO profile_learning_lock
                (name, owner_token, pid, boot_id, starttime, acquired_at)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT (name) DO NOTHING`,
        args: [
          LOCK_NAME,
          ownerToken,
          identity.pid,
          identity.bootId,
          identity.starttime,
          Date.now(),
        ],
      });
      if (rowsAffected(inserted) === 1) {
        return releaseFn(ownerToken);
      }

      const selected = await client.execute({
        sql: `SELECT owner_token, pid, boot_id, starttime, acquired_at
              FROM profile_learning_lock WHERE name = ?`,
        args: [LOCK_NAME],
      });
      const row = selected.rows[0] as Record<string, unknown> | undefined;
      if (!row) {
        // Released between our failed INSERT and the SELECT. Treat as
        // contention: skip this round, the next idle event retries.
        return null;
      }

      const parsed = parseOwnerRow(row);
      if (!parsed.ok) {
        log("profile-learning lock: malformed coordination record, refusing to acquire", {
          directory,
          reason: parsed.reason,
        });
        return null;
      }

      if (!ownerIsDefinitelyDead(parsed.owner, identity)) {
        // Live holder, EPERM, or uncertain identity: never reclaim, never
        // guess, and no TTL is allowed to override this.
        return null;
      }

      const claimed = await client.execute({
        sql: `UPDATE profile_learning_lock
              SET owner_token = ?, pid = ?, boot_id = ?, starttime = ?, acquired_at = ?
              WHERE name = ? AND owner_token = ?`,
        args: [
          ownerToken,
          identity.pid,
          identity.bootId,
          identity.starttime,
          Date.now(),
          LOCK_NAME,
          parsed.owner.ownerToken,
        ],
      });
      if (rowsAffected(claimed) === 1) {
        log("profile-learning lock: reclaimed lock from dead owner", {
          directory,
          previousPid: parsed.owner.pid,
        });
        return releaseFn(ownerToken);
      }
      // Lost the CAS race to another reclaimer.
      return null;
    });
  } catch (error) {
    log("profile-learning lock: coordination database unavailable, refusing to acquire", {
      directory,
      error: String(error),
    });
    return null;
  }
}

/**
 * Whether a coordination record currently exists. Test/inspection helper; a
 * database error is reported as "not held" but logged.
 */
export async function isProfileLearningLockHeld(): Promise<boolean> {
  try {
    return await withCoordinationDb(async (client) => {
      const result = await client.execute({
        sql: `SELECT 1 FROM profile_learning_lock WHERE name = ? LIMIT 1`,
        args: [LOCK_NAME],
      });
      return result.rows.length > 0;
    });
  } catch (error) {
    log("profile-learning lock: coordination database unavailable in isProfileLearningLockHeld", {
      error: String(error),
    });
    return false;
  }
}

/** Boot identity the lock would record for this process (test/inspection helper). */
export function getProfileLearningBootId(): string | null {
  return readBootId();
}

/** Starttime identity the lock would record for `pid` (test/inspection helper). */
export function getProfileLearningStarttime(pid: number): string | null {
  const result = readProcStat(pid);
  return result.status === "ok" ? result.starttime : null;
}
