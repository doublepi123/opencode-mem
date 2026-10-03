import type { ApiResult } from "$shared/api";

type BulkDeleteRequest = (endpoint: string, options: RequestInit) => Promise<ApiResult>;

export type BulkDeleteLinkHint = {
  id: string;
  linkedMemoryId?: string;
  linkedPromptId?: string;
};

export type BulkDeleteOutcome = {
  success: boolean;
  deletedIds: string[];
  error?: string;
};

function cascadedMemoryIds(promptIds: string[], items: BulkDeleteLinkHint[]): string[] {
  if (promptIds.length === 0 || items.length === 0) return [];

  const promptIdSet = new Set(promptIds);
  const cascaded = new Set<string>();

  for (const item of items) {
    if (promptIdSet.has(item.id) && item.linkedMemoryId) {
      cascaded.add(item.linkedMemoryId);
    }
    if (item.linkedPromptId && promptIdSet.has(item.linkedPromptId)) {
      cascaded.add(item.id);
    }
  }

  return [...cascaded];
}

export async function deleteSelectedMemories(
  ids: string[],
  request: BulkDeleteRequest,
  items: BulkDeleteLinkHint[] = []
): Promise<BulkDeleteOutcome> {
  const promptIds = ids.filter((id) => id.startsWith("prompt_"));
  let memoryIds = ids.filter((id) => !id.startsWith("prompt_"));
  const deletedIds: string[] = [];

  if (promptIds.length > 0) {
    const result = await request("/api/prompts/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids: promptIds, cascade: true }),
    });

    if (!result.success) {
      return {
        success: false,
        deletedIds,
        error: result.error,
      };
    }

    deletedIds.push(...promptIds);
    const cascaded = cascadedMemoryIds(promptIds, items);
    deletedIds.push(...cascaded);
    const cascadedSet = new Set(cascaded);
    memoryIds = memoryIds.filter((id) => !cascadedSet.has(id));
  }

  if (memoryIds.length > 0) {
    const result = await request("/api/memories/bulk-delete", {
      method: "POST",
      body: JSON.stringify({ ids: memoryIds, cascade: true }),
    });

    if (!result.success) {
      return {
        success: false,
        deletedIds,
        error: result.error,
      };
    }

    deletedIds.push(...memoryIds);
  }

  return { success: true, deletedIds };
}
