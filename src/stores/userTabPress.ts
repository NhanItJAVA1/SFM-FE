const listeners = new Set<() => void>();

export function emitUserTabPress() {
  listeners.forEach((listener) => listener());
}

export function subscribeUserTabPress(listener: () => void) {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}
