<script lang="ts">
  import Activity from "@lucide/svelte/icons/activity";
  import Heart from "@lucide/svelte/icons/heart";
  import RotateCcwClock from "@lucide/svelte/icons/rotate-ccw-clock";
  import RefreshCw from "@lucide/svelte/icons/refresh-cw";
  import Sparkles from "@lucide/svelte/icons/sparkles";
  import UserX from "@lucide/svelte/icons/user-x";
  import Workflow from "@lucide/svelte/icons/workflow";
  import type { Component } from "svelte";
  import ChangelogDialog from "./ChangelogDialog.svelte";
  import ProfileItemCard from "./ProfileItemCard.svelte";
  import ProfileItemDialog from "./ProfileItemDialog.svelte";
  import Button from "$lib/components/ui/button.svelte";
  import BorderedPanel from "$lib/components/ui/bordered-panel.svelte";
  import EmptyState from "$lib/components/ui/empty-state.svelte";
  import PaginationBar from "$lib/components/ui/pagination-bar.svelte";
  import { useI18n } from "$lib/i18n/context.svelte";
  import { formatDate } from "$lib/format";
  import { pageSlice } from "$lib/pagination";
  import { parseProfileField, type ProfileField } from "$lib/profile-utils";
  import type { ProfileItem, UserProfile } from "$lib/types";
  import {
    GAP,
    GAP_TIGHT,
    ICON_SM,
    ICON_WELL,
    META_CHIP,
    STACK_SECTION,
    STACK_TIGHT,
  } from "$lib/ui/styles";
  import { cn } from "$lib/utils";

  type Props = {
    profile: UserProfile | null;
    loading?: boolean;
    onRefresh?: () => void;
    onCleanup?: () => void;
  };

  let { profile, loading = false, onRefresh, onCleanup }: Props = $props();

  const PAGE_SIZE = 20;
  const i18n = useI18n();

  let profilePages = $state({ pref: 1, pat: 1, wf: 1 });
  let changelogOpen = $state(false);
  let itemDialogOpen = $state(false);
  let itemType = $state<ProfileField | null>(null);
  let itemIndex = $state(0);
  let itemAction = $state<"edit" | "delete">("edit");
  let itemData = $state<ProfileItem | null>(null);

  const profileData = $derived.by(() => {
    if (!profile?.exists || !profile.profileData) return null;
    let data = profile.profileData;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return null;
      }
    }
    return data as NonNullable<UserProfile["profileData"]>;
  });

  const preferences = $derived(parseProfileField(profileData?.preferences));
  const patterns = $derived(parseProfileField(profileData?.patterns));
  const workflowsRaw = $derived(parseProfileField(profileData?.workflows));
  const workflows = $derived(
    workflowsRaw
      .map((item, index) => ({ item, index }))
      .sort((a, b) => (b.item.frequency || 0) - (a.item.frequency || 0))
  );

  const prefPage = $derived(pageSlice(preferences, profilePages.pref, PAGE_SIZE));
  const patPage = $derived(pageSlice(patterns, profilePages.pat, PAGE_SIZE));
  const wfPage = $derived(pageSlice(workflows, profilePages.wf, PAGE_SIZE));

  function openItem(type: ProfileField, index: number, action: "edit" | "delete") {
    const list =
      type === "preferences" ? preferences : type === "patterns" ? patterns : workflowsRaw;
    const current = list[index];
    if (!current) return;
    itemType = type;
    itemIndex = index;
    itemAction = action;
    itemData = current;
    itemDialogOpen = true;
  }

  function setPage(pageKey: "pref" | "pat" | "wf", p: number) {
    profilePages = { ...profilePages, [pageKey]: p };
  }

  type Section = {
    key: "pref" | "pat" | "wf";
    type: ProfileField;
    icon: Component;
    titleKey: "profile-preferences" | "profile-patterns" | "profile-workflows";
    emptyKey: "empty-preferences" | "empty-patterns" | "empty-workflows";
    count: number;
    page: ReturnType<typeof pageSlice<ProfileItem | { item: ProfileItem; index: number }>>;
    grid?: boolean;
  };

  const sections = $derived<Section[]>([
    {
      key: "pref",
      type: "preferences",
      icon: Heart,
      titleKey: "profile-preferences",
      emptyKey: "empty-preferences",
      count: preferences.length,
      page: prefPage,
      grid: true,
    },
    {
      key: "pat",
      type: "patterns",
      icon: Activity,
      titleKey: "profile-patterns",
      emptyKey: "empty-patterns",
      count: patterns.length,
      page: patPage,
      grid: true,
    },
    {
      key: "wf",
      type: "workflows",
      icon: Workflow,
      titleKey: "profile-workflows",
      emptyKey: "empty-workflows",
      count: workflowsRaw.length,
      page: wfPage,
    },
  ]);
</script>

{#if loading && !profile}
  <EmptyState>{i18n.t("loading-profile")}</EmptyState>
{:else if !profile?.exists}
  <div class={cn("flex flex-col items-center py-10 text-muted-foreground", GAP)}>
    <UserX class="size-8" aria-hidden="true" />
    <p class="text-sm">{profile?.message || i18n.t("empty-preferences")}</p>
  </div>
{:else if profileData}
  <div class={STACK_SECTION}>
    <div class={cn("flex flex-wrap items-center justify-between", GAP)}>
      <span class={META_CHIP}>
        {i18n.t("profile-meta", {
          count: profile.totalPromptsAnalyzed ?? 0,
          date: profile.lastAnalyzedAt ? formatDate(profile.lastAnalyzedAt) : "—",
        })}
      </span>
      <div class={cn("flex flex-wrap items-center", GAP_TIGHT)}>
        <Button type="button" variant="outline" onclick={() => onCleanup?.()}>
          <Sparkles class={ICON_SM} aria-hidden="true" />
          {i18n.t("btn-ai-cleanup")}
        </Button>
        <Button type="button" variant="outline" onclick={() => onRefresh?.()}>
          <RefreshCw class={ICON_SM} aria-hidden="true" />
          {i18n.t("btn-refresh")}
        </Button>
        <Button type="button" variant="outline" onclick={() => (changelogOpen = true)}>
          <RotateCcwClock class={ICON_SM} aria-hidden="true" />
          History
        </Button>
      </div>
    </div>

    <div class={STACK_SECTION}>
      {#each sections as section (section.key)}
        <BorderedPanel title={i18n.t(section.titleKey)} collapsible>
          {#snippet leading()}
            <span class={cn(ICON_WELL, "size-6")} aria-hidden="true">
              <section.icon class={ICON_SM} />
            </span>
          {/snippet}
          {#snippet trailing()}
            <span class="text-sm font-normal text-muted-foreground">{section.count}</span>
          {/snippet}
          {#if section.count === 0}
            <p class="text-sm text-muted-foreground">{i18n.t(section.emptyKey)}</p>
          {:else if section.grid}
            <div class={STACK_TIGHT}>
              {#each section.page.items as item, i (`${section.key}-${i}`)}
                {@const profileItem = item as ProfileItem}
                {@const idx = (section.type === "preferences" ? preferences : patterns).indexOf(
                  profileItem
                )}
                <ProfileItemCard
                  item={profileItem}
                  type={section.type}
                  onEdit={() => openItem(section.type, idx, "edit")}
                  onDelete={() => openItem(section.type, idx, "delete")}
                />
              {/each}
            </div>
            <PaginationBar
              page={section.page}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => setPage(section.key, p)}
            />
          {:else}
            <div class={STACK_TIGHT}>
              {#each section.page.items as entry (`wf-${(entry as { index: number }).index}`)}
                {@const wf = entry as { item: ProfileItem; index: number }}
                <ProfileItemCard
                  item={wf.item}
                  type="workflows"
                  variant="workflow"
                  onEdit={() => openItem("workflows", wf.index, "edit")}
                  onDelete={() => openItem("workflows", wf.index, "delete")}
                />
              {/each}
            </div>
            <PaginationBar
              page={section.page}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => setPage(section.key, p)}
            />
          {/if}
        </BorderedPanel>
      {/each}
    </div>
  </div>

  <ChangelogDialog
    bind:open={changelogOpen}
    onOpenChange={(v) => (changelogOpen = v)}
    profileId={profile?.id || ""}
  />

  <ProfileItemDialog
    bind:open={itemDialogOpen}
    onOpenChange={(v) => (itemDialogOpen = v)}
    type={itemType}
    index={itemIndex}
    action={itemAction}
    item={itemData}
    onSaved={onRefresh}
  />
{/if}
