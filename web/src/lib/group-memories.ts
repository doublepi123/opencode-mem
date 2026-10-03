import type { MemoryGroup, MemoryItem } from "./types";

function groupTime(group: MemoryGroup): number {
  const raw = group.isPair ? group.memory.createdAt : group.item.createdAt;
  return new Date(raw).getTime();
}

export function isGroupPinned(group: MemoryGroup): boolean {
  return group.isPair ? !!group.memory.isPinned : !!group.item.isPinned;
}

export function groupMemories(items: MemoryItem[]): MemoryGroup[] {
  const map = new Map(items.map((item) => [item.id, item]));
  const pairs: MemoryGroup[] = [];
  const processed = new Set<string>();

  for (const item of items) {
    if (processed.has(item.id)) continue;

    if (item.type === "memory" && item.linkedPromptId && map.has(item.linkedPromptId)) {
      const prompt = map.get(item.linkedPromptId)!;
      pairs.push({ isPair: true, memory: item, prompt });
      processed.add(item.id);
      processed.add(prompt.id);
    } else if (item.type === "prompt" && item.linkedMemoryId && map.has(item.linkedMemoryId)) {
      const memory = map.get(item.linkedMemoryId)!;
      pairs.push({ isPair: true, memory, prompt: item });
      processed.add(item.id);
      processed.add(memory.id);
    } else {
      pairs.push({ isPair: false, type: item.type, item });
      processed.add(item.id);
    }
  }

  return pairs.sort((a, b) => {
    const pinA = isGroupPinned(a) ? 1 : 0;
    const pinB = isGroupPinned(b) ? 1 : 0;
    if (pinA !== pinB) return pinB - pinA;
    return groupTime(b) - groupTime(a);
  });
}

export function partitionPinnedGroups(groups: MemoryGroup[]): {
  pinned: MemoryGroup[];
  rest: MemoryGroup[];
} {
  const pinned: MemoryGroup[] = [];
  const rest: MemoryGroup[] = [];
  for (const group of groups) {
    (isGroupPinned(group) ? pinned : rest).push(group);
  }
  return { pinned, rest };
}
