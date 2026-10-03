<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLAttributes<HTMLDivElement> & { class?: string };

  let { class: className, children, ...rest }: Props = $props();
</script>

<div
  data-slot="dialog-header"
  class={cn("flex flex-col gap-2 text-center sm:text-start", className)}
  {...rest}
>
  {@render children?.()}
</div>
