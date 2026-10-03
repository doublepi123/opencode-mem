<script lang="ts">
  import type { HTMLInputAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLInputAttributes & { class?: string };

  let { class: className, value = $bindable(), placeholder = " ", ...rest }: Props = $props();
</script>

<input
  data-slot="input"
  class={cn(
    "border-input file:text-foreground placeholder:text-transparent selection:bg-primary selection:text-primary-foreground h-10 w-full min-w-0 rounded-xl border bg-card px-2.5 py-0 text-sm leading-10 shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
    "focus-visible:border-primary focus-visible:ring-0",
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
    className
  )}
  {placeholder}
  bind:value
  {...rest}
/>
