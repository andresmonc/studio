import { useState } from "react";

const STORAGE_PREFIX = "goff:tip-dismissed:";

// useDismissedTip remembers in localStorage that the user hid a tip, so it
// stays hidden across reloads. Best-effort: without storage the tip just
// comes back on the next visit.
export function useDismissedTip(id: string): [boolean, () => void] {
  const key = STORAGE_PREFIX + id;
  const [dismissed, setDismissed] = useState(() => {
    try {
      return globalThis.localStorage?.getItem(key) === "1";
    } catch {
      return false;
    }
  });
  const dismiss = () => {
    try {
      globalThis.localStorage?.setItem(key, "1");
    } catch {
      // Storage unavailable / quota exceeded — hide it for this visit only.
    }
    setDismissed(true);
  };
  return [dismissed, dismiss];
}
