import { useCallback, useState } from "react";

const STORAGE_KEY = "guides:lang";
export const DEFAULT_GUIDES_LANG = "en";

function readStoredLang(): string {
  if (typeof window === "undefined") return DEFAULT_GUIDES_LANG;
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? DEFAULT_GUIDES_LANG;
  } catch {
    return DEFAULT_GUIDES_LANG;
  }
}

/** Persists the reader's chosen guide language across visits (and apps, since both use the same key). */
export function useGuidesLanguage(): [string, (lang: string) => void] {
  const [lang, setLangState] = useState<string>(readStoredLang);

  const setLang = useCallback((next: string) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private mode, storage full) — in-memory state still works this session.
    }
  }, []);

  return [lang, setLang];
}
