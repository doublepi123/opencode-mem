import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import { connect } from "@tursodatabase/database";

const CHILD_DB_PATH_ENV = "OPENCODE_MEM_TURSO_SMOKE_CHILD_DB_PATH";
const FILE_LOCK_RETRY_DELAYS_MS = [10, 25, 50, 100, 200, 400, 800];
const RETRYABLE_FILE_LOCK_CODES = new Set(["EBUSY", "EPERM", "EACCES"]);

async function verifyTursoVector(dbPath) {
  const db = await connect(dbPath);
  try {
    await db.exec(`
      CREATE TABLE vectors (id INTEGER PRIMARY KEY, vector F32_BLOB(4) NOT NULL);
      INSERT INTO vectors (vector) VALUES (vector32('[1,0,0,0]'));
    `);
    const rows = await db
      .prepare(
        "SELECT id, vector_distance_cos(vector, vector32('[1,0,0,0]')) AS dist FROM vectors ORDER BY dist ASC LIMIT 1"
      )
      .all();
    assert.equal(rows.length, 1, "exact vector scan must return the inserted vector");
    assert.equal(Number(rows[0]?.id), 1, "exact vector scan must return the expected row");
    console.log("Turso database vector smoke test passed");
  } finally {
    await db.close();
  }
}

async function removeDatabaseFiles(dbPath) {
  for (const suffix of ["", "-shm", "-wal"]) {
    const path = `${dbPath}${suffix}`;
    for (let attempt = 0; ; attempt += 1) {
      try {
        rmSync(path, { force: true });
        break;
      } catch (error) {
        const code = error?.code;
        if (attempt >= FILE_LOCK_RETRY_DELAYS_MS.length || !RETRYABLE_FILE_LOCK_CODES.has(code)) {
          throw error;
        }
        await delay(FILE_LOCK_RETRY_DELAYS_MS[attempt]);
      }
    }
  }
}

const childDbPath = process.env[CHILD_DB_PATH_ENV];
if (childDbPath) {
  await verifyTursoVector(childDbPath);
} else {
  const dbPath = join(tmpdir(), `opencode-mem-turso-smoke-${process.pid}-${Date.now()}.db`);
  const child = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
    env: { ...process.env, [CHILD_DB_PATH_ENV]: dbPath },
    stdio: "inherit",
  });

  try {
    if (child.error) throw child.error;
    if (child.status !== 0) {
      throw new Error(
        `Turso vector smoke child exited with ${child.signal ?? `status ${child.status}`}`
      );
    }
  } finally {
    await removeDatabaseFiles(dbPath);
  }
}
