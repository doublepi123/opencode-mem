<script lang="ts">
  import AppDialog from "$lib/components/ui/app-dialog.svelte";
  import DialogActions from "$lib/components/ui/dialog-actions.svelte";
  import FormField from "$lib/components/ui/form-field.svelte";
  import NativeSelect from "$lib/components/ui/native-select.svelte";
  import TagsField from "$lib/components/ui/tags-field.svelte";
  import Textarea from "$lib/components/ui/textarea.svelte";
  import { useI18n } from "$lib/i18n/context.svelte";
  import { MEMORY_TYPES } from "$lib/memory-types";
  import type { TagInfo } from "$lib/types";
  import { GAP_LOOSE, STACK_FORM } from "$lib/ui/styles";

  type Props = {
    open?: boolean;
    tags?: TagInfo[];
    knownTags?: string[];
    tag?: string;
    type?: string;
    contentTags?: string[];
    content?: string;
    onOpenChange?: (open: boolean) => void;
    onSubmit?: (event: Event) => void | Promise<void>;
  };

  let {
    open = $bindable(false),
    tags = [],
    knownTags = [],
    tag = $bindable(""),
    type = $bindable(""),
    contentTags = $bindable<string[]>([]),
    content = $bindable(""),
    onOpenChange,
    onSubmit,
  }: Props = $props();

  const i18n = useI18n();

  function handleOpenChange(next: boolean) {
    open = next;
    onOpenChange?.(next);
  }

  async function submit(e?: Event) {
    e?.preventDefault();
    await onSubmit?.(e ?? new Event("submit"));
  }
</script>

<AppDialog
  bind:open
  title={i18n.t("section-add")}
  class="sm:max-w-lg"
  onOpenChange={handleOpenChange}
>
  <form id="add-memory-form" class={STACK_FORM} onsubmit={submit}>
    <div class="grid sm:grid-cols-2 {GAP_LOOSE}">
      <FormField id="add-tag" label={i18n.t("label-tag")} value={tag}>
        <NativeSelect id="add-tag" required bind:value={tag}>
          <option value=""></option>
          {#each tags as item (item.tag)}
            <option value={item.tag}>{item.displayName || item.tag}</option>
          {/each}
        </NativeSelect>
      </FormField>
      <FormField id="add-type" label={i18n.t("label-type")} value={type}>
        <NativeSelect id="add-type" bind:value={type}>
          <option value=""></option>
          {#each MEMORY_TYPES as memoryType (memoryType || "other")}
            <option value={memoryType}>
              {i18n.t(memoryType ? `opt-${memoryType}` : "opt-other")}
            </option>
          {/each}
        </NativeSelect>
      </FormField>
    </div>
    <FormField label={i18n.t("label-tags")} floating={false} spacing="normal">
      <TagsField
        value={contentTags}
        suggestions={knownTags}
        placeholder={i18n.t("placeholder-new-tag")}
        addLabel={i18n.t("btn-add-tag")}
        onChange={(next) => (contentTags = next)}
      />
    </FormField>
    <FormField id="add-content" label={i18n.t("label-content")} value={content}>
      <Textarea id="add-content" rows={5} required bind:value={content} />
    </FormField>
  </form>
  {#snippet footer()}
    <DialogActions
      onCancel={() => handleOpenChange(false)}
      primaryLabel={i18n.t("btn-add-memory")}
      onPrimary={() => submit()}
    />
  {/snippet}
</AppDialog>
