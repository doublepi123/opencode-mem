<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import XIcon from "@lucide/svelte/icons/x";
  import { cn } from "$lib/utils";
  import Button from "./button.svelte";
  import type { Snippet } from "svelte";

  type Props = {
    open?: boolean;
    onOpenChange?: (open: boolean) => void;
    class?: string;
    showCloseButton?: boolean;
    children?: Snippet;
  };

  let {
    open = $bindable(false),
    onOpenChange,
    class: className,
    showCloseButton = true,
    children,
  }: Props = $props();

  function handleOpenChange(next: boolean) {
    open = next;
    onOpenChange?.(next);
  }
</script>

<DialogPrimitive.Root bind:open onOpenChange={handleOpenChange}>
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      class="data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/50"
    />
    <DialogPrimitive.Content
      class={cn(
        "bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 ring-foreground/5 dark:ring-foreground/10 grid max-w-[calc(100%-2rem)] gap-6 rounded-[min(var(--radius-4xl),24px)] p-6 text-sm shadow-xl ring-1 duration-100 sm:max-w-md fixed top-1/2 left-1/2 z-50 w-full -translate-x-1/2 -translate-y-1/2 outline-none [--floating-label-bg:var(--popover)]",
        className
      )}
    >
      {@render children?.()}
      {#if showCloseButton}
        <DialogPrimitive.Close>
          {#snippet child({ props })}
            <Button
              {...props}
              variant="ghost"
              class="bg-secondary absolute top-4 right-4"
              size="icon-sm"
            >
              <XIcon />
              <span class="sr-only">Close</span>
            </Button>
          {/snippet}
        </DialogPrimitive.Close>
      {/if}
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
</DialogPrimitive.Root>
