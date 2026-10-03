<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLAttributes<HTMLDivElement> & { class?: string };

  let { class: className, children, ...rest }: Props = $props();
</script>

<div
  data-slot="dialog-footer"
  class={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
  {...rest}
>
  {@render children?.()}
</div>
