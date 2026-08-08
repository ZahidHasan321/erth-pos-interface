import { useEffect } from "react";
import { toast } from "sonner";
import { useRegisterSW } from "virtual:pwa-register/react";

/**
 * Installed-app update notice. A deploy installs the new build in the
 * background; we reload only when the user says so, because a silent reload
 * mid-order would discard whatever is typed into the form.
 */
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

export function PwaUpdatePrompt() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    // An installed app on a shop tablet can stay open for days without a
    // navigation, and the browser only re-checks the service worker on one.
    // Without this poll a deploy could sit unnoticed indefinitely.
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        if (!navigator.onLine) return;
        void registration.update().catch(() => {
          // Offline or the check failed; the next tick retries.
        });
      }, UPDATE_CHECK_INTERVAL_MS);
    },
  });

  useEffect(() => {
    if (!needRefresh) return;
    toast("A new version is available", {
      description: "Reload when you are done with the current screen.",
      duration: Infinity,
      action: {
        label: "Reload",
        onClick: () => void updateServiceWorker(true),
      },
    });
  }, [needRefresh, updateServiceWorker]);

  return null;
}
