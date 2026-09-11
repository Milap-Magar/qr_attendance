import { useEffect } from "react";

// Keep the screen on while `enabled` (e.g. while a QR is showing, so the phone doesn't dim mid-scan).
// The browser drops the lock whenever the tab is hidden, so take it again when it comes back.
// Silently does nothing where unsupported, or on plain http (Wake Lock needs https or localhost).
export function useWakeLock(enabled: boolean) {
  useEffect(() => {
    if (!enabled || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let done = false;

    const acquire = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock.request("screen").then((l) => {
        lock = l;
        if (done) l.release().catch(() => {}); // page was left while the request was in flight
      }, () => {});
    };

    acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      done = true;
      document.removeEventListener("visibilitychange", acquire);
      lock?.release().catch(() => {});
    };
  }, [enabled]);
}
