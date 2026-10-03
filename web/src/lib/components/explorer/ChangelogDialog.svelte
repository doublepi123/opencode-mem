<script lang="ts">
  import { fetchAPI } from "$lib/api";
  import AppDialog from "$lib/components/ui/app-dialog.svelte";
  import EmptyState from "$lib/components/ui/empty-state.svelte";
  import ScrollArea from "$lib/components/ui/scroll-area.svelte";
  import { formatDate } from "$lib/format";
  import { useI18n } from "$lib/i18n/context.svelte";
  import { CARD_PAD, GAP, STACK, STACK_DENSE, SURFACE_CARD } from "$lib/ui/styles";
  import { cn } from "$lib/utils";

  type ChangelogEntry = {
    version: number;
    changeType: string;
    createdAt: string;
    changeSummary: string;
  };

  type Props = {
    open?: boolean;
    profileId?: string;
    onOpenChange?: (open: boolean) => void;
  };

  let { open = $bindable(false), profileId = "", onOpenChange }: Props = $props();

  const i18n = useI18n();
  let loading = $state(false);
  let entries = $state<ChangelogEntry[]>([]);

  $effect(() => {
    if (open && profileId) {
      void loadChangelog(profileId);
    }
  });

  async function loadChangelog(id: string) {
    loading = true;
    entries = [];
    const result = await fetchAPI<ChangelogEntry[]>(
      `/api/user-profile/changelog?profileId=${encodeURIComponent(id)}&limit=10`
    );
    loading = false;
    if (result.success && result.data) {
      entries = result.data;
    } else {
      entries = [];
    }
  }

  function handleOpenChange(next: boolean) {
    open = next;
    onOpenChange?.(next);
  }
</script>

<AppDialog
  bind:open
  title={i18n.t("modal-changelog-title")}
  class="sm:max-w-lg"
  onOpenChange={handleOpenChange}
>
  <ScrollArea class="max-h-80">
    {#if loading}
      <EmptyState class="py-6">{i18n.t("loading-changelog")}</EmptyState>
    {:else if entries.length === 0}
      <EmptyState class="py-6">{i18n.t("empty-changelog")}</EmptyState>
    {:else}
      <div class={cn(STACK, "pr-3")}>
        {#each entries as entry, i (`${entry.version}-${i}`)}
          <div class={cn(SURFACE_CARD, CARD_PAD, STACK_DENSE)}>
            <div class={cn("flex flex-wrap items-center text-xs", GAP)}>
              <span class="font-medium">v{entry.version}</span>
              <span class="text-muted-foreground">{entry.changeType}</span>
              <span class="text-muted-foreground ml-auto">
                {formatDate(entry.createdAt)}
              </span>
            </div>
            <p class="text-sm">{entry.changeSummary}</p>
          </div>
        {/each}
      </div>
    {/if}
  </ScrollArea>
</AppDialog>
