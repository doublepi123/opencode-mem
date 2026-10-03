import { describe, expect, test } from "bun:test";
import { deleteSelectedMemories } from "../web/src/lib/bulk-delete";

type Call = {
  endpoint: string;
  options: RequestInit;
};

describe("deleteSelectedMemories", () => {
  test("deletes prompt and memory groups and reports all deleted ids", async () => {
    const calls: Call[] = [];
    const result = await deleteSelectedMemories(
      ["prompt_1", "memory_1", "memory_2"],
      async (endpoint, options) => {
        calls.push({ endpoint, options });
        return { success: true };
      }
    );

    expect(result).toEqual({
      success: true,
      deletedIds: ["prompt_1", "memory_1", "memory_2"],
    });
    expect(calls.map((call) => call.endpoint)).toEqual([
      "/api/prompts/bulk-delete",
      "/api/memories/bulk-delete",
    ]);
    expect(JSON.parse(String(calls[0]!.options.body))).toEqual({
      ids: ["prompt_1"],
      cascade: true,
    });
    expect(JSON.parse(String(calls[1]!.options.body))).toEqual({
      ids: ["memory_1", "memory_2"],
      cascade: true,
    });
  });

  test("stops after the first failed group instead of reporting success", async () => {
    const calls: string[] = [];
    const result = await deleteSelectedMemories(["prompt_1", "memory_1"], async (endpoint) => {
      calls.push(endpoint);
      return { success: false, error: "prompt delete failed" };
    });

    expect(result).toEqual({
      success: false,
      deletedIds: [],
      error: "prompt delete failed",
    });
    expect(calls).toEqual(["/api/prompts/bulk-delete"]);
  });

  test("preserves successful prompt deletions when the memory group fails", async () => {
    const result = await deleteSelectedMemories(["prompt_1", "memory_1"], async (endpoint) =>
      endpoint === "/api/prompts/bulk-delete"
        ? { success: true }
        : { success: false, error: "memory delete failed" }
    );

    expect(result).toEqual({
      success: false,
      deletedIds: ["prompt_1"],
      error: "memory delete failed",
    });
  });

  test("treats cascade-linked memories as deleted and skips them on partial failure", async () => {
    const calls: Call[] = [];
    const result = await deleteSelectedMemories(
      ["prompt_1", "memory_1", "memory_2"],
      async (endpoint, options) => {
        calls.push({ endpoint, options });
        return endpoint === "/api/prompts/bulk-delete"
          ? { success: true }
          : { success: false, error: "memory delete failed" };
      },
      [
        { id: "prompt_1", linkedMemoryId: "memory_1" },
        { id: "memory_1", linkedPromptId: "prompt_1" },
        { id: "memory_2" },
      ]
    );

    expect(result).toEqual({
      success: false,
      deletedIds: ["prompt_1", "memory_1"],
      error: "memory delete failed",
    });
    expect(JSON.parse(String(calls[1]!.options.body))).toEqual({
      ids: ["memory_2"],
      cascade: true,
    });
  });
});
