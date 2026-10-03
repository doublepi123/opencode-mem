<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";
  import { cn } from "$lib/utils";
  import { buttonVariants, type ButtonVariantProps } from "./button-variants";

  type Props = HTMLButtonAttributes &
    ButtonVariantProps & {
      class?: string;
    };

  let {
    class: className,
    variant = "default",
    size = "default",
    type = "button",
    children,
    ...rest
  }: Props = $props();
</script>

<button
  data-slot="button"
  {type}
  class={cn(buttonVariants({ variant, size }), className)}
  {...rest}
>
  {@render children?.()}
</button>
