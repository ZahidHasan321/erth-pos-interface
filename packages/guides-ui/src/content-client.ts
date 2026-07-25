import { useQuery } from "@tanstack/react-query";
import type { ChapterDetail, SearchEntry, Toc } from "./types";

/**
 * Both apps sync guide content into their own public/guides/ (see
 * guides/render/sync-app-public.ts) so this is a same-origin static fetch,
 * not a cross-app call.
 */
export const GUIDES_BASE = "/guides";

async function fetchJson<T>(url: string, what: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to load ${what} (${res.status} ${res.statusText}) from ${url}`);
  }
  return (await res.json()) as T;
}

export function guideImageUrl(image: string): string {
  return `${GUIDES_BASE}/${image}`;
}

export function fetchGuidesToc(lang: string): Promise<Toc> {
  return fetchJson<Toc>(`${GUIDES_BASE}/app-content/toc.${lang}.json`, `the guides table of contents (${lang})`);
}

export function fetchGuidesSearchIndex(lang: string): Promise<SearchEntry[]> {
  return fetchJson<SearchEntry[]>(
    `${GUIDES_BASE}/app-content/search-index.${lang}.json`,
    `the guides search index (${lang})`,
  );
}

export function fetchGuideChapter(lang: string, chapterId: string): Promise<ChapterDetail> {
  return fetchJson<ChapterDetail>(
    `${GUIDES_BASE}/app-content/chapters/${lang}/${chapterId}.json`,
    `guide chapter "${chapterId}" (${lang})`,
  );
}

const STATIC_CONTENT_OPTIONS = { staleTime: Infinity, retry: false } as const;

export function useGuidesToc(lang: string) {
  return useQuery({
    queryKey: ["guides", "toc", lang],
    queryFn: () => fetchGuidesToc(lang),
    ...STATIC_CONTENT_OPTIONS,
  });
}

export function useGuidesSearchIndex(lang: string) {
  return useQuery({
    queryKey: ["guides", "search-index", lang],
    queryFn: () => fetchGuidesSearchIndex(lang),
    ...STATIC_CONTENT_OPTIONS,
  });
}

export function useGuideChapter(lang: string, chapterId: string | undefined) {
  return useQuery({
    queryKey: ["guides", "chapter", lang, chapterId],
    queryFn: () => fetchGuideChapter(lang, chapterId as string),
    enabled: Boolean(chapterId),
    ...STATIC_CONTENT_OPTIONS,
  });
}
