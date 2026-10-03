import { pushToast, type ToastItem, type ToastVariant } from "./toastStack";

export const toastState = $state({
  items: [] as ToastItem[],
});

export function showToast(text: string, variant: ToastVariant = "success") {
  toastState.items = pushToast(toastState.items, text, variant);
}

export function dismissToast(id: string) {
  toastState.items = toastState.items.filter((item) => item.id !== id);
}

/** Drop-in toast API (`success` / `error` / `warning` / `info`). */
export const toast = {
  success: (text: string) => showToast(text, "success"),
  error: (text: string) => showToast(text, "error"),
  warning: (text: string) => showToast(text, "warning"),
  info: (text: string) => showToast(text, "info"),
};
