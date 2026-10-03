<script lang="ts">
  import AppDialog from "$lib/components/ui/app-dialog.svelte";
  import DialogActions from "$lib/components/ui/dialog-actions.svelte";
  import { confirmState, settleConfirm } from "$lib/confirm.svelte";
  import { useI18n } from "$lib/i18n/context.svelte";

  const i18n = useI18n();

  function onOpenChange(open: boolean) {
    if (!open) settleConfirm(false);
  }
</script>

<AppDialog
  open={confirmState.open}
  title={confirmState.title}
  class="sm:max-w-md"
  showCloseButton={true}
  {onOpenChange}
>
  {#if confirmState.detail}
    <p class="text-sm leading-snug text-muted-foreground whitespace-pre-line">
      {confirmState.detail}
    </p>
  {/if}
  {#snippet footer()}
    <DialogActions
      onCancel={() => settleConfirm(false)}
      cancelLabel={confirmState.cancelLabel || i18n.t("btn-cancel")}
      primaryLabel={confirmState.confirmLabel}
      primaryVariant={confirmState.tone === "danger" ? "destructive" : "default"}
      onPrimary={() => settleConfirm(true)}
    />
  {/snippet}
</AppDialog>
