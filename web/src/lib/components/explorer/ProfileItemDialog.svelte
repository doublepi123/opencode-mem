<script lang="ts">
  import X from "@lucide/svelte/icons/x";
  import { fetchAPI, toastApiResult } from "$lib/api";
  import AppDialog from "$lib/components/ui/app-dialog.svelte";
  import Button from "$lib/components/ui/button.svelte";
  import DialogActions from "$lib/components/ui/dialog-actions.svelte";
  import FormField from "$lib/components/ui/form-field.svelte";
  import Input from "$lib/components/ui/input.svelte";
  import Textarea from "$lib/components/ui/textarea.svelte";
  import { useI18n } from "$lib/i18n/context.svelte";
  import type { ProfileField } from "$lib/profile-utils";
  import type { ProfileItem } from "$lib/types";
  import { GAP, ICON_SM, STACK_FORM, STACK_TIGHT } from "$lib/ui/styles";
  import { cn } from "$lib/utils";

  type Props = {
    open?: boolean;
    type?: ProfileField | null;
    index?: number;
    action?: "edit" | "delete";
    item?: ProfileItem | null;
    onOpenChange?: (open: boolean) => void;
    onSaved?: () => void;
  };

  let {
    open = $bindable(false),
    type = null,
    index = 0,
    action = "edit",
    item = null,
    onOpenChange,
    onSaved,
  }: Props = $props();

  const i18n = useI18n();
  let category = $state("");
  let description = $state("");
  let steps = $state<string[]>([""]);
  let deleteStep = $state<"1" | "2">("1");
  let saving = $state(false);

  const isEdit = $derived(action === "edit");
  const isWorkflow = $derived(type === "workflows");
  const title = $derived(
    isEdit
      ? i18n.t("btn-edit")
      : deleteStep === "2"
        ? i18n.t("confirm-delete-title")
        : i18n.t("confirm-delete")
  );

  $effect(() => {
    if (open && item) {
      category = item.category || "";
      description = item.description || "";
      steps = item.steps?.length ? [...item.steps] : [""];
      deleteStep = "1";
    }
  });

  function handleOpenChange(next: boolean) {
    open = next;
    onOpenChange?.(next);
  }

  function addStep() {
    steps = [...steps, ""];
  }

  function removeStep(i: number) {
    const next = steps.filter((_, idx) => idx !== i);
    steps = next.length === 0 ? [""] : next;
  }

  function updateStep(i: number, value: string) {
    steps = steps.map((s, idx) => (idx === i ? value : s));
  }

  async function mutateItem(body: Record<string, unknown>) {
    saving = true;
    const result = await fetchAPI("/api/user-profile/item", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    saving = false;
    await toastApiResult(result, {
      successKey: body.action === "delete" ? "toast-delete-success" : "toast-update-success",
      failKey: body.action === "delete" ? "toast-delete-failed" : "toast-update-failed",
      translate: i18n.t,
      onSuccess: () => {
        handleOpenChange(false);
        onSaved?.();
      },
    });
  }

  async function submit(e?: Event) {
    e?.preventDefault();
    if (!type) return;

    if (action === "delete") {
      if (deleteStep === "1") {
        deleteStep = "2";
        return;
      }
      await mutateItem({ type, index, action: "delete" });
      return;
    }

    const body: Record<string, unknown> = {
      type,
      index,
      action: "edit",
      category: isWorkflow ? undefined : category,
      description,
    };
    if (type === "workflows") {
      body.steps = steps.map((s) => s.trim()).filter(Boolean);
    }
    await mutateItem(body);
  }
</script>

<AppDialog bind:open {title} class="sm:max-w-lg" onOpenChange={handleOpenChange}>
  <form id="profile-item-form" class={STACK_FORM} onsubmit={submit}>
    {#if isEdit || deleteStep === "1"}
      {#if !isWorkflow}
        <FormField id="profile-item-category" label={i18n.t("label-category")} value={category}>
          <Input id="profile-item-category" bind:value={category} disabled={!isEdit} />
        </FormField>
      {/if}
      <FormField id="profile-item-description" label={i18n.t("label-description")}>
        <Textarea
          id="profile-item-description"
          rows={4}
          bind:value={description}
          disabled={!isEdit}
        />
      </FormField>
      {#if isWorkflow && isEdit}
        <FormField label={i18n.t("label-steps")} floating={false} spacing="normal">
          <div class={STACK_TIGHT}>
            {#each steps as step, i (i)}
              <div class={cn("flex items-center", GAP)}>
                <span class="text-xs text-muted-foreground w-5 tabular-nums">
                  {i + 1}
                </span>
                <FormField
                  id={`profile-step-${i}`}
                  label={`Step ${i + 1}`}
                  value={step}
                  class="flex-1"
                >
                  <Input
                    id={`profile-step-${i}`}
                    value={step}
                    oninput={(e) => updateStep(i, e.currentTarget.value)}
                  />
                </FormField>
                <Button type="button" variant="ghost" size="icon-xs" onclick={() => removeStep(i)}>
                  <X class={ICON_SM} />
                </Button>
              </div>
            {/each}
          </div>
          <Button type="button" variant="secondary" size="sm" onclick={addStep} class="mt-2">
            {i18n.t("btn-add-step")}
          </Button>
        </FormField>
      {/if}
    {/if}
  </form>
  {#snippet footer()}
    <DialogActions
      onCancel={() => handleOpenChange(false)}
      primaryLabel={isEdit ? i18n.t("btn-save") : i18n.t("btn-delete")}
      primaryVariant={isEdit ? "default" : "destructive"}
      primaryDisabled={saving}
      onPrimary={() => void submit()}
    />
  {/snippet}
</AppDialog>
