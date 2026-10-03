<script lang="ts">
  import type { Snippet } from "svelte";
  import Checkbox from "$lib/components/ui/checkbox.svelte";
  import { cn } from "$lib/utils";

  type Props = {
    checked: boolean;
    class?: string;
    onToggle: (checked: boolean) => void;
    children?: Snippet;
  };

  let { checked, class: className, onToggle, children }: Props = $props();

  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle(!checked);
    }
  }
</script>

<div
  class={cn("flex items-center gap-2 text-sm cursor-pointer", className)}
  role="checkbox"
  aria-checked={checked}
  tabindex={0}
  onclick={() => onToggle(!checked)}
  onkeydown={onKeyDown}
>
  <span class="pointer-events-none inline-flex">
    <Checkbox {checked} tabindex={-1} />
  </span>
  {@render children?.()}
</div>
