<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLAttributes<HTMLDivElement> & { class?: string };

  let { class: className, children, ...rest }: Props = $props();
</script>

<div
  data-slot="alert-description"
  class={cn("text-muted-foreground text-sm [&_p]:leading-relaxed col-start-2", className)}
  {...rest}
>
  {@render children?.()}
</div>
