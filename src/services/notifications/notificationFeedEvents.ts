type Listener = () => void;

const listeners = new Set<Listener>();

export function subscribeNotificationFeedInvalidation(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateNotificationFeed(): void {
  listeners.forEach(l => l());
}
