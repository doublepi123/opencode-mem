<script lang="ts">
  import PenLine from "@lucide/svelte/icons/pen-line";
  import Pin from "@lucide/svelte/icons/pin";
  import PinOff from "@lucide/svelte/icons/pin-off";
  import Trash2 from "@lucide/svelte/icons/trash-2";
  import Button from "$lib/components/ui/button.svelte";
  import { ICON_SM } from "$lib/ui/styles";

  type Props = {
    id: string;
    pinned?: boolean;
    isLinked?: boolean;
    deleteLabel: string;
    showPinEdit?: boolean;
    onPin?: (id: string) => void;
    onUnpin?: (id: string) => void;
    onEdit?: (id: string) => void;
    onDelete?: (id: string, isLinked: boolean) => void;
  };

  let {
    id,
    pinned = false,
    isLinked = false,
    deleteLabel,
    showPinEdit = true,
    onPin,
    onUnpin,
    onEdit,
    onDelete,
  }: Props = $props();
</script>

<div class="flex shrink-0 items-center gap-1">
  {#if showPinEdit}
    {#if pinned}
      <Button
        variant="ghost"
        size="icon-xs"
        class="text-primary hover:text-primary"
        title="Unpin"
        aria-label="Unpin"
        onclick={() => onUnpin?.(id)}
      >
        <PinOff class={ICON_SM} aria-hidden="true" />
      </Button>
    {:else}
      <Button
        variant="ghost"
        size="icon-xs"
        title="Pin"
        aria-label="Pin"
        onclick={() => onPin?.(id)}
      >
        <Pin class={ICON_SM} aria-hidden="true" />
      </Button>
    {/if}
    <Button
      variant="ghost"
      size="icon-xs"
      title="Edit"
      aria-label="Edit"
      onclick={() => onEdit?.(id)}
    >
      <PenLine class={ICON_SM} aria-hidden="true" />
    </Button>
  {/if}
  <Button
    variant="destructive"
    size="icon-xs"
    title={deleteLabel}
    aria-label={deleteLabel}
    onclick={() => onDelete?.(id, isLinked)}
  >
    <Trash2 class={ICON_SM} aria-hidden="true" />
  </Button>
</div>
