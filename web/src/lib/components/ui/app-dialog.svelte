<script lang="ts">
  import type { Snippet } from "svelte";
  import Dialog from "$lib/components/ui/dialog.svelte";
  import DialogFooter from "$lib/components/ui/dialog-footer.svelte";
  import DialogHeader from "$lib/components/ui/dialog-header.svelte";
  import DialogTitle from "$lib/components/ui/dialog-title.svelte";

  type Props = {
    open?: boolean;
    title: string;
    class?: string;
    showCloseButton?: boolean;
    onOpenChange?: (open: boolean) => void;
    children?: Snippet;
    footer?: Snippet;
  };

  let {
    open = $bindable(false),
    title,
    class: className,
    showCloseButton = true,
    onOpenChange,
    children,
    footer,
  }: Props = $props();
</script>

<Dialog bind:open {onOpenChange} class={className} {showCloseButton}>
  <DialogHeader>
    <DialogTitle>{title}</DialogTitle>
  </DialogHeader>
  {@render children?.()}
  {#if footer}
    <DialogFooter>
      {@render footer()}
    </DialogFooter>
  {/if}
</Dialog>
