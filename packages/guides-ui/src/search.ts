import { useMemo } from "react";
import Fuse, { type IFuseOptions } from "fuse.js";
import type { SearchEntry } from "./types";

const FUSE_OPTIONS: IFuseOptions<SearchEntry> = {
  keys: [
    { name: "title", weight: 2 },
    { name: "chapterTitle", weight: 1.2 },
    { name: "snippet", weight: 1 },
  ],
  threshold: 0.35,
  ignoreLocation: true,
};

export function searchGuides(index: SearchEntry[], query: string, limit = 20): SearchEntry[] {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return new Fuse(index, FUSE_OPTIONS).search(trimmed, { limit }).map((r) => r.item);
}

export function useGuidesSearch(
  index: SearchEntry[] | undefined,
  query: string,
  limit = 20,
): SearchEntry[] {
  const fuse = useMemo(() => new Fuse(index ?? [], FUSE_OPTIONS), [index]);

  return useMemo(() => {
    const trimmed = query.trim();
    if (!trimmed || !index) return [];
    return fuse.search(trimmed, { limit }).map((r) => r.item);
  }, [fuse, index, query, limit]);
}
