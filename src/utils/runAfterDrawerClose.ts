export function runAfterDrawerClose(action?: () => void, delayMs = 80): void {
  if (!action) return;
  setTimeout(action, delayMs);
}
