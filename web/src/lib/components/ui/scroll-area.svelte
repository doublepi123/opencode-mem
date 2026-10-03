<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLAttributes<HTMLDivElement> & { class?: string };

  let { class: className, children, ...rest }: Props = $props();
</script>

<div data-slot="scroll-area" class={cn("relative overflow-auto", className)} {...rest}>
  {@render children?.()}
</div>
