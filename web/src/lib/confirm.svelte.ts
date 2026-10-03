export type ConfirmTone = "danger" | "default";

export type ConfirmOptions = {
  title: string;
  detail?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: ConfirmTone;
};

export const confirmState = $state({
  open: false,
  title: "",
  detail: "",
  confirmLabel: "",
  cancelLabel: "",
  tone: "danger" as ConfirmTone,
});

let resolver: ((ok: boolean) => void) | null = null;

/** App-styled confirm — replaces `window.confirm`. */
export function askConfirm(options: ConfirmOptions): Promise<boolean> {
  resolver?.(false);
  confirmState.open = true;
  confirmState.title = options.title;
  confirmState.detail = options.detail ?? "";
  confirmState.confirmLabel = options.confirmLabel;
  confirmState.cancelLabel = options.cancelLabel ?? "";
  confirmState.tone = options.tone ?? "danger";
  return new Promise((resolve) => {
    resolver = resolve;
  });
}

export function settleConfirm(ok: boolean) {
  if (!confirmState.open && !resolver) return;
  confirmState.open = false;
  const resolve = resolver;
  resolver = null;
  resolve?.(ok);
}
