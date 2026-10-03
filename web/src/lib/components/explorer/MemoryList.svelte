<script lang="ts">
  import Pin from "@lucide/svelte/icons/pin";
  import Layers from "@lucide/svelte/icons/layers";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import MemoryCard from "./MemoryCard.svelte";
  import EmptyState from "$lib/components/ui/empty-state.svelte";
  import Button from "$lib/components/ui/button.svelte";
  import Checkbox from "$lib/components/ui/checkbox.svelte";
  import PaginationBar from "$lib/components/ui/pagination-bar.svelte";
  import { groupMemories, partitionPinnedGroups } from "$lib/group-memories";
  import { useI18n } from "$lib/i18n/context.svelte";
  import type { MemoryGroup, MemoryItem } from "$lib/types";
  import { GAP, GAP_TIGHT, ICON_SM, STACK, STACK_LOOSE } from "$lib/ui/styles";
  import { cn } from "$lib/utils";

  type Props = {
    memories: MemoryItem[];
    selectedIds: Set<string>;
    currentPage: number;
    totalPages: number;
    totalItems: number;
    isSearching: boolean;
    loading?: boolean;
    error?: string | null;
    onSelect: (id: string, selected: boolean) => void;
    onSelectAllPage: () => void;
    onDeselectAll: () => void;
    onBulkDelete: () => void;
    onPageChange: (delta: number) => void;
    onPin: (id: string) => void;
    onUnpin: (id: string) => void;
    onEdit: (id: string) => void;
    onDeleteMemory: (id: string, isLinked: boolean) => void;
    onDeletePrompt: (id: string, isLinked: boolean) => void;
    onTagsChange?: (id: string, tags: string[]) => void;
    knownTags?: string[];
  };

  let {
    memories,
    selectedIds,
    currentPage,
    totalPages,
    loading = false,
    error = null,
    onSelect,
    onSelectAllPage,
    onDeselectAll,
    onBulkDelete,
    onPageChange,
    onPin,
    onUnpin,
    onEdit,
    onDeleteMemory,
    onDeletePrompt,
    onTagsChange,
    knownTags = [],
  }: Props = $props();

  const i18n = useI18n();
  const groups = $derived(groupMemories(memories));
  const partitioned = $derived(partitionPinnedGroups(groups));
  const pageInfo = $derived(i18n.t("text-page", { current: currentPage, total: totalPages }));

  const pageIds = $derived(groups.map((group) => (group.isPair ? group.memory.id : group.item.id)));
  const selectedCount = $derived(selectedIds.size);
  const allPageSelected = $derived(
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id))
  );
  const somePageSelected = $derived(pageIds.some((id) => selectedIds.has(id)));

  function onHeaderCheckedChange(next: boolean | "indeterminate") {
    if (next === true || (next === false && !allPageSelected && somePageSelected)) {
      onSelectAllPage();
      return;
    }
    onDeselectAll();
  }

  function cardProps(group: MemoryGroup) {
    const shared = {
      onSelect,
      onPin,
      onUnpin,
      onEdit,
      onDeleteMemory,
      onDeletePrompt,
      onTagsChange,
      knownTags,
    };
    if (group.isPair) {
      return {
        ...shared,
        variant: "pair" as const,
        memory: group.memory,
        prompt: group.prompt,
        selected: selectedIds.has(group.memory.id),
        key: group.memory.id,
      };
    }
    return {
      ...shared,
      variant: (group.type === "prompt" ? "prompt" : "memory") as "prompt" | "memory",
      item: group.item,
      selected: selectedIds.has(group.item.id),
      key: group.item.id,
    };
  }
</script>

{#snippet cards(list: MemoryGroup[])}
  {#each list as group (group.isPair ? group.memory.id : group.item.id)}
    {@const props = cardProps(group)}
    <MemoryCard {...props} />
  {/each}
{/snippet}

<div class={STACK}>
  <div class={cn("flex items-center", GAP)}>
    <Checkbox
      checked={allPageSelected}
      indeterminate={somePageSelected && !allPageSelected}
      onCheckedChange={onHeaderCheckedChange}
      aria-label={allPageSelected ? i18n.t("btn-deselect-all") : i18n.t("btn-select-all")}
      title={allPageSelected ? i18n.t("btn-deselect-all") : i18n.t("btn-select-all")}
      disabled={pageIds.length === 0}
    />
    {#if selectedCount > 0}
      <span class="text-xs text-muted-foreground">
        {i18n.t("text-selected", { count: selectedCount })}
      </span>
    {/if}
    <div class={cn("ms-auto flex items-center", GAP)}>
      {#if selectedCount > 0}
        <Button
          variant="destructive"
          size="icon-xs"
          aria-label={i18n.t("btn-delete-selected")}
          title={i18n.t("btn-delete-selected")}
          onclick={onBulkDelete}
        >
          <Trash2 class={ICON_SM} />
        </Button>
      {/if}
      <PaginationBar
        mode="prev-next"
        {currentPage}
        {totalPages}
        {pageInfo}
        onDelta={onPageChange}
      />
    </div>
  </div>

  <div class={cn(STACK, "min-h-32")}>
    {#if loading && memories.length === 0}
      <EmptyState>{i18n.t("loading-init")}</EmptyState>
    {:else if error}
      <EmptyState class="text-destructive">Error: {error}</EmptyState>
    {:else if groups.length === 0}
      <EmptyState>{i18n.t("empty-memories")}</EmptyState>
    {:else if partitioned.pinned.length > 0}
      <div class={STACK_LOOSE}>
        <div class={STACK}>
          <div class={cn("flex items-center text-xs font-medium text-muted-foreground", GAP_TIGHT)}>
            <Pin class={cn(ICON_SM, "text-primary")} />
            {i18n.t("badge-pinned")}
            <span class="tabular-nums">({partitioned.pinned.length})</span>
          </div>
          {@render cards(partitioned.pinned)}
        </div>
        {#if partitioned.rest.length > 0}
          <div class={STACK}>
            <div
              class={cn("flex items-center text-xs font-medium text-muted-foreground", GAP_TIGHT)}
            >
              <Layers class={ICON_SM} />
              {i18n.t("section-all")}
              <span class="tabular-nums">({partitioned.rest.length})</span>
            </div>
            {@render cards(partitioned.rest)}
          </div>
        {/if}
      </div>
    {:else}
      {@render cards(groups)}
    {/if}
  </div>
</div>
