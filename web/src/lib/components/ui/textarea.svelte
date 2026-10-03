<script lang="ts">
  import type { HTMLTextareaAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";

  type Props = HTMLTextareaAttributes & { class?: string };

  let { class: className, value = $bindable(), placeholder = " ", ...rest }: Props = $props();
</script>

<textarea
  data-slot="textarea"
  class={cn(
    "border-input placeholder:text-transparent flex field-sizing-content min-h-20 w-full rounded-xl border bg-card px-2.5 py-2.5 text-sm shadow-xs transition-[color,box-shadow] outline-none disabled:cursor-not-allowed disabled:opacity-50",
    "focus-visible:border-primary focus-visible:ring-0",
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
    className
  )}
  {placeholder}
  bind:value
  {...rest}></textarea>
