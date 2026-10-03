<script lang="ts">
  import { Dialog as DialogPrimitive } from "bits-ui";
  import { cn } from "$lib/utils";

  type Props = DialogPrimitive.TitleProps & { class?: string };

  let { class: className, children, ...rest }: Props = $props();
</script>

<DialogPrimitive.Title
  data-slot="dialog-title"
  class={cn("text-base font-medium leading-none", className)}
  {...rest}
>
  {@render children?.()}
</DialogPrimitive.Title>
