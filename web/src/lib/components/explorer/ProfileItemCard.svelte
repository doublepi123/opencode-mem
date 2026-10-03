<script lang="ts">
  import Info from "@lucide/svelte/icons/info";
  import PenLine from "@lucide/svelte/icons/pen-line";
  import Target from "@lucide/svelte/icons/target";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Button from "$lib/components/ui/button.svelte";
  import WorkflowSteps from "$lib/components/ui/workflow-steps.svelte";
  import { useI18n } from "$lib/i18n/context.svelte";
  import { CARD_TITLE } from "$lib/memory-display";
  import {
    confidencePct,
    evidenceCount,
    evidenceTitle,
    type ProfileField,
  } from "$lib/profile-utils";
  import type { ProfileItem } from "$lib/types";
  import {
    CARD_PAD,
    GAP,
    GAP_TIGHT,
    ICON_SM,
    META_CHIP,
    STACK_TIGHT,
    SURFACE_CARD,
  } from "$lib/ui/styles";
  import { cn } from "$lib/utils";

  type Props = {
    item: ProfileItem;
    type: ProfileField;
    variant?: "grid" | "workflow";
    onEdit: () => void;
    onDelete: () => void;
  };

  let { item, type: _type, variant = "grid", onEdit, onDelete }: Props = $props();

  const i18n = useI18n();
  const pct = $derived(confidencePct(item));
  const count = $derived(evidenceCount(item));
  const title = $derived(evidenceTitle(item));
</script>

<div class={cn(SURFACE_CARD, CARD_PAD, STACK_TIGHT)}>
  <div class={cn("flex items-center", GAP)}>
    <div class={cn("flex min-w-0 flex-1 items-center", GAP)}>
      <h3 class={cn(CARD_TITLE, "min-w-0 truncate")}>
        {#if variant === "workflow"}
          {item.description || i18n.t("profile-workflows")}
        {:else}
          {item.category || "General"}
        {/if}
      </h3>
      <span
        class={cn(META_CHIP, "h-7 min-w-7 justify-center font-medium text-foreground")}
        title={`${pct}%`}
      >
        {pct}%
      </span>
    </div>
    <div class="flex shrink-0 items-center gap-1">
      <Button
        variant="ghost"
        size="icon-xs"
        title={i18n.t("btn-edit") || "Edit"}
        aria-label={i18n.t("btn-edit") || "Edit"}
        onclick={onEdit}
      >
        <PenLine class={ICON_SM} aria-hidden="true" />
      </Button>
      <Button
        variant="destructive"
        size="icon-xs"
        title={i18n.t("btn-delete") || "Delete"}
        aria-label={i18n.t("btn-delete") || "Delete"}
        onclick={onDelete}
      >
        <Trash2 class={ICON_SM} aria-hidden="true" />
      </Button>
    </div>
  </div>

  {#if variant !== "workflow"}
    <p class="text-sm">{item.description || ""}</p>
  {/if}

  {#if variant === "workflow" && item.steps?.length}
    <WorkflowSteps steps={item.steps} variant="chips" />
  {/if}

  {#if item.evidence || item.frequency || variant === "workflow"}
    <div class={cn("flex items-center text-xs text-muted-foreground", GAP_TIGHT)}>
      <span
        class="inline-flex items-center gap-1"
        title={i18n.t("label-evidence-tooltip", { count: item.frequency || 1 })}
      >
        <Target class={ICON_SM} aria-hidden="true" />
        {item.frequency || 1}
      </span>
      {#if count > 0}
        <span>·</span>
        <span class="inline-flex items-center gap-1" {title}>
          <Info class={ICON_SM} aria-hidden="true" />
          {count} evidence
        </span>
      {/if}
    </div>
  {/if}
</div>
