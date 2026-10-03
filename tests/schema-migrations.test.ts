import { afterEach, describe, expect, it } from "bun:test";
import { mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { connect } from "@tursodatabase/database";
import { cleanupTursoTestDirectory } from "./turso-test-utils.js";
import {
  applySchemaMigrations,
  USER_PROMPTS_MIGRATIONS,
  ensureUserPromptColumns,
} from "../src/services/turso/schema-migrations.js";
import { TursoDb } from "../src/services/turso/turso-db.js";

describe("schema migrations", () => {
  let baseDir: string;

  afterEach(async () => {
    await cleanupTursoTestDirectory(baseDir);
  });

  it("applies user_version migrations idempotently", async () => {
    baseDir = mkdtempSync(join(tmpdir(), "schema-mig-"));
    const dbPath = join(baseDir, "user-prompts.db");
    const native = await connect(dbPath);
    const db = new TursoDb(native);

    const version = await applySchemaMigrations(db, USER_PROMPTS_MIGRATIONS, {
      dbPath,
      label: "test",
    });
    expect(version).toBe(1);
    await ensureUserPromptColumns(db);

    const again = await applySchemaMigrations(db, USER_PROMPTS_MIGRATIONS, {
      dbPath,
      label: "test",
    });
    expect(again).toBe(1);

    const row = await db.get<{ user_version?: number }>("PRAGMA user_version");
    expect(Number(row?.user_version)).toBe(1);
    await db.close();
  });
});
