<script lang="ts">
  import type { HTMLAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLAttributes<HTMLDivElement> & {
    class?: string;
    orientation?: "horizontal" | "vertical";
    decorative?: boolean;
  };

  let {
    class: className,
    orientation = "horizontal",
    decorative = true,
    ...rest
  }: Props = $props();
</script>

<div
  data-slot="separator"
  role={decorative ? "none" : "separator"}
  aria-orientation={decorative ? undefined : orientation}
  class={cn(
    "bg-border shrink-0",
    orientation === "horizontal" ? "h-px w-full" : "h-full w-px",
    className
  )}
  {...rest}
></div>
