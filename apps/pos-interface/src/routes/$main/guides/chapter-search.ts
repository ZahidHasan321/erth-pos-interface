export type ChapterSearch = { step?: string };

export function parseChapterSearch(search: Record<string, unknown>): ChapterSearch {
  return { step: typeof search.step === "string" ? search.step : undefined };
}
