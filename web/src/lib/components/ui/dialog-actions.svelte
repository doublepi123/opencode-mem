<script lang="ts">
  import Button from "$lib/components/ui/button.svelte";
  import { useI18n } from "$lib/i18n/context.svelte";

  type Props = {
    onCancel: () => void;
    primaryLabel?: string;
    primaryVariant?: "default" | "destructive" | "secondary";
    primaryDisabled?: boolean;
    primaryType?: "button" | "submit";
    onPrimary?: () => void;
    cancelLabel?: string;
  };

  let {
    onCancel,
    primaryLabel,
    primaryVariant = "default",
    primaryDisabled = false,
    primaryType = "button",
    onPrimary,
    cancelLabel,
  }: Props = $props();

  const i18n = useI18n();
</script>

<Button type="button" variant="secondary" onclick={onCancel}>
  {cancelLabel || i18n.t("btn-cancel")}
</Button>
{#if primaryLabel}
  <Button
    type={primaryType}
    variant={primaryVariant}
    disabled={primaryDisabled}
    onclick={onPrimary}
  >
    {primaryLabel}
  </Button>
{/if}
