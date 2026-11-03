import * as React from "react";

// Cloudflare Turnstile (managed mode, explicit render). Site key comes from
// VITE_TURNSTILE_SITE_KEY; with no key this renders nothing. To reset after an
// attempt, remount it (change its `key`).

type TurnstileApi = {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => string;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

// This package typechecks as CJS without vite/client types; the apps (Vite,
// ESM) compile and replace this line normally.
// @ts-ignore
const SITE_KEY: string | undefined = import.meta.env.VITE_TURNSTILE_SITE_KEY;

const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
let scriptLoad: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  scriptLoad ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = SCRIPT_SRC;
    s.async = true;
    s.onload = () => (window.turnstile ? resolve(window.turnstile) : reject(new Error("turnstile missing")));
    s.onerror = () => {
      scriptLoad = null;
      reject(new Error("turnstile failed to load"));
    };
    document.head.appendChild(s);
  });
  return scriptLoad;
}

export function Turnstile({ onToken }: { onToken: (token: string | null) => void }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const onTokenRef = React.useRef(onToken);
  onTokenRef.current = onToken;

  React.useEffect(() => {
    if (!SITE_KEY) return;
    let id: string | undefined;
    let api: TurnstileApi | undefined;
    let cancelled = false;
    loadTurnstile()
      .then((t) => {
        if (cancelled || !ref.current) return;
        api = t;
        id = t.render(ref.current, {
          sitekey: SITE_KEY,
          callback: (token) => onTokenRef.current(token),
          "expired-callback": () => onTokenRef.current(null),
          "error-callback": () => onTokenRef.current(null),
        });
      })
      .catch((err) => console.error("[turnstile]", err));
    return () => {
      cancelled = true;
      onTokenRef.current(null);
      if (api && id) api.remove(id);
    };
  }, []);

  if (!SITE_KEY) return null;
  return <div ref={ref} />;
}
