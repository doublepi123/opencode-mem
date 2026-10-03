<script lang="ts">
  import AppDialog from "$lib/components/ui/app-dialog.svelte";
  import DialogActions from "$lib/components/ui/dialog-actions.svelte";
  import FormField from "$lib/components/ui/form-field.svelte";
  import NativeSelect from "$lib/components/ui/native-select.svelte";
  import TagsField from "$lib/components/ui/tags-field.svelte";
  import Textarea from "$lib/components/ui/textarea.svelte";
  import { useI18n } from "$lib/i18n/context.svelte";
  import { MEMORY_TYPES } from "$lib/memory-types";
  import { STACK_FORM } from "$lib/ui/styles";

  type Props = {
    open?: boolean;
    content?: string;
    type?: string;
    tags?: string[];
    knownTags?: string[];
    onOpenChange?: (open: boolean) => void;
    onSave?: (content: string, tags: string[], type: string) => void;
  };

  let {
    open = $bindable(false),
    content = "",
    type = "",
    tags = [],
    knownTags = [],
    onOpenChange,
    onSave,
  }: Props = $props();

  const i18n = useI18n();
  let draft = $state("");
  let draftType = $state("");
  let draftTags = $state<string[]>([]);

  $effect(() => {
    if (open) {
      draft = content;
      draftType = type;
      draftTags = [...tags];
    }
  });

  function handleOpenChange(next: boolean) {
    open = next;
    onOpenChange?.(next);
  }

  function submit(e?: Event) {
    e?.preventDefault();
    const value = draft.trim();
    if (!value) return;
    onSave?.(value, draftTags, draftType);
  }
</script>

<AppDialog
  bind:open
  title={i18n.t("modal-edit-title")}
  class="sm:max-w-lg"
  onOpenChange={handleOpenChange}
>
  <form id="edit-memory-form" class={STACK_FORM} onsubmit={submit}>
    <FormField id="edit-type" label={i18n.t("label-type")} value={draftType}>
      <NativeSelect id="edit-type" bind:value={draftType}>
        <option value=""></option>
        {#each MEMORY_TYPES as memoryType (memoryType || "other")}
          <option value={memoryType}>
            {i18n.t(memoryType ? `opt-${memoryType}` : "opt-other")}
          </option>
        {/each}
      </NativeSelect>
    </FormField>
    <FormField id="edit-content" label={i18n.t("label-content")} value={draft}>
      <Textarea id="edit-content" rows={6} bind:value={draft} required />
    </FormField>
    <FormField label={i18n.t("label-tags")} floating={false} spacing="normal">
      <TagsField
        value={draftTags}
        suggestions={knownTags}
        placeholder={i18n.t("placeholder-new-tag")}
        addLabel={i18n.t("btn-add-tag")}
        onChange={(next) => (draftTags = next)}
      />
    </FormField>
  </form>
  {#snippet footer()}
    <DialogActions
      onCancel={() => handleOpenChange(false)}
      primaryLabel={i18n.t("btn-save")}
      onPrimary={() => submit()}
    />
  {/snippet}
</AppDialog>
