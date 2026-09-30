/**
 * Bun --preload patch for short-write simulation (see
 * profile-cold-buffer-worker-shortwrite.ts for the worker itself).
 *
 * Loaded via `bun --preload` so the patch applies before any ESM import
 * binds writeSync. It only limits how many bytes a single low-level
 * fs.writeSync call forwards — the production saveColdBuffers() code path,
 * the real tmp+rename flow and the real fd bookkeeping all stay live.
 *
 * mode is read from argv[2] of the *worker* command line:
 *   short-ascii | short-utf8 | zero | half
 */
// The CJS namespace is the only patchable surface: the ESM namespace binding
// of node:fs is frozen (Object.defineProperty on it throws), while Bun's
// --preload runs before ESM imports bind writeSync, so patching the CJS
// module also intercepts the production ESM import below.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const fs = require("node:fs") as typeof import("node:fs");
const real = fs.writeSync;
const argv = process.argv as unknown as string[];
const mode = argv.find((a) => a.startsWith("SWMODE="))?.slice("SWMODE=".length) ?? "";
let callIndex = 0;

(fs as any).writeSync = function (fd: number, ...rest: any[]) {
  if (fd === 1 || fd === 2) {
    return (real as any)(fd, ...rest);
  }
  callIndex++;
  const buffer = rest[0] as Buffer;
  if (mode === "zero") {
    if (callIndex === 1) return 0;
    return (real as any)(fd, ...rest);
  }
  if (mode === "half") {
    // Call 1 writes half the payload; call 2 fails mid-payload with EIO so
    // the cleanup path runs with real partial bytes in the tmp file.
    if (callIndex === 1) {
      const len = rest[2] as number;
      return (real as any)(fd, buffer, rest[1], Math.max(0, Math.floor(len / 2)));
    }
    if (callIndex === 2) {
      const err = new Error("simulated EIO mid-payload") as any;
      err.code = "EIO";
      throw err;
    }
    return (real as any)(fd, ...rest);
  }
  // short-ascii / short-utf8: one byte per call — multi-byte chars are sliced
  // mid-codepoint across calls, proving the write loop is byte-accurate.
  return (real as any)(fd, buffer, rest[1], 1);
};
