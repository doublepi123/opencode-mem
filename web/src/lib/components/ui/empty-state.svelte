<script lang="ts">
  import type { Snippet } from "svelte";
  import { cn } from "$lib/utils";

  type Props = {
    class?: string;
    children?: Snippet;
  };

  let { class: className, children }: Props = $props();
</script>

<div class={cn("text-sm text-muted-foreground py-8 text-center", className)}>
  {@render children?.()}
</div>
