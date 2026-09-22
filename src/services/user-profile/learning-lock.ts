import { mkdirSync, readFileSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { CONFIG } from "../../config.js";
import { log } from "../logger.js";

const LEARNING_LOCK = ".profile-learning.lock";

/**
 * Upper bound on how long a lock may be held before other processes treat it as
 * abandoned. Profile learning issues LLM requests, so this has to exceed a slow
 * provider round trip; it only matters when a holder dies without releasing and
 * its PID has already been reused by an unrelated process.
 */
const STALE_LOCK_MS = 30 * 60 * 1000;

/**
 * Grace period during which a lock file whose contents cannot be parsed is left
 * alone. `writeFileSync` is not atomic, so a reader can observe a file that was
 * created but not yet filled in. Deleting it on sight would hand the lock to a
 * second process while the first believes it holds it.
 */
const WRITE_WINDOW_MS = 5_000;

interface LearningLockState {
  pid: number;
  acquiredAt: number;
  directory: string;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function lockPath(): string {
  return join(CONFIG.storagePath || "", LEARNING_LOCK);
}

function removeLock(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    // Already gone (lost the cleanup race) or held open by the OS. Either way
    // this process does not own it, so surface nothing.
  }
}

/**
 * Returns the state of a lock that is still held, or null when no live holder
 * remains. A stale lock is removed as a side effect so the caller can retry.
 */
function readLiveLock(path: string): LearningLockState | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return null;
  }

  let state: LearningLockState;
  try {
    state = JSON.parse(raw) as LearningLockState;
  } catch {
    // Unparseable: either mid-write by a live acquirer, or genuinely corrupt.
    // Respect the write window before reclaiming so we never steal a lock that
    // another process is in the middle of taking.
    let mtimeMs: number;
    try {
      mtimeMs = statSync(path).mtimeMs;
    } catch {
      return null;
    }
    if (Date.now() - mtimeMs < WRITE_WINDOW_MS) {
      return { pid: -1, acquiredAt: mtimeMs, directory: "<initializing>" };
    }
    removeLock(path);
    return null;
  }

  if (!Number.isInteger(state.pid) || state.pid <= 0) {
    removeLock(path);
    return null;
  }

  if (state.pid !== process.pid && !isProcessAlive(state.pid)) {
    log("profile-learning lock: reclaiming lock from dead holder", { pid: state.pid });
    removeLock(path);
    return null;
  }

  const age = Date.now() - (state.acquiredAt ?? 0);
  if (Number.isFinite(age) && age > STALE_LOCK_MS) {
    log("profile-learning lock: reclaiming expired lock", { pid: state.pid, ageMs: age });
    removeLock(path);
    return null;
  }

  return state;
}

/**
 * Serializes profile learning across every process sharing this storage path.
 *
 * Profile learning selects a batch of prompts with a plain SELECT, issues an LLM
 * request, then writes the profile and marks the batch. None of that is atomic,
 * so two processes running it concurrently would analyze the same prompts twice
 * and the slower writer would clobber the faster one's profile update.
 *
 * Returns a release function, or null when another process holds the lock — in
 * which case the caller must skip this round rather than wait, because the next
 * idle event will retry.
 */
export function tryAcquireProfileLearningLock(directory: string): (() => void) | null {
  const path = lockPath();

  try {
    mkdirSync(CONFIG.storagePath || "", { recursive: true });
  } catch {
    // Storage path already exists, or cannot be created — the write below fails
    // loudly enough on its own.
  }

  const holder = readLiveLock(path);
  if (holder) return null;

  const state: LearningLockState = {
    pid: process.pid,
    acquiredAt: Date.now(),
    directory,
  };

  try {
    writeFileSync(path, JSON.stringify(state), { flag: "wx" });
  } catch {
    // Lost the race: another process created the file between our check and
    // write. `wx` is what makes that detectable rather than silently shared.
    return null;
  }

  let released = false;
  return () => {
    if (released) return;
    released = true;
    try {
      const current = JSON.parse(readFileSync(path, "utf-8")) as LearningLockState;
      if (current.pid !== process.pid) return;
    } catch {
      return;
    }
    removeLock(path);
  };
}

export function isProfileLearningLockHeld(): boolean {
  return readLiveLock(lockPath()) !== null;
}
