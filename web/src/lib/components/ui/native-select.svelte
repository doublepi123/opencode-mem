<script lang="ts">
  import type { HTMLSelectAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLSelectAttributes & {
    class?: string;
    value?: string;
  };

  let { class: className, value = $bindable(""), children, ...rest }: Props = $props();
</script>

<select
  class={cn(
    "h-10 w-full appearance-none rounded-xl border border-border bg-card px-2.5 py-0 text-sm leading-10 text-foreground transition hover:bg-surface-hover outline-none focus-visible:border-primary focus-visible:ring-0 disabled:cursor-not-allowed disabled:opacity-50",
    className
  )}
  bind:value
  {...rest}
>
  {@render children?.()}
</select>
