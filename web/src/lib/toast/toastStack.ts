export type ToastVariant = "success" | "error" | "warning" | "info";

export type ToastItem = {
  id: string;
  text: string;
  variant: ToastVariant;
};

export const TOAST_MS = 3200;
export const MAX_TOASTS = 5;

function randomId(): string {
  const words = new Uint32Array(4);
  crypto.getRandomValues(words);
  return Array.from(words, (word) => word.toString(16).padStart(8, "0")).join("");
}

/** Newest toast last; drop the oldest when the stack is full. */
export function pushToast(
  toasts: ToastItem[],
  text: string,
  variant: ToastVariant = "success"
): ToastItem[] {
  return [...toasts, { id: randomId(), text, variant }].slice(-MAX_TOASTS);
}
