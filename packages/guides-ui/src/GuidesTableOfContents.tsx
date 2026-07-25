import type { ReactNode } from "react";
import { useState } from "react";
import { BookOpenIcon, SearchIcon } from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Input } from "@repo/ui/input";
import { Skeleton } from "@repo/ui/skeleton";
import { useGuidesSearchIndex, useGuidesToc } from "./content-client";
import { useGuidesSearch } from "./search";
import type { SearchEntry, TocEntry } from "./types";

export type GuidesTableOfContentsProps = {
  lang: string;
  onNavigateToChapter: (chapterId: string, stepKey?: string) => void;
  /** Slot for a LanguageToggle (or anything else), rendered next to the title. */
  headerSlot?: ReactNode;
};

export function GuidesTableOfContents({ lang, onNavigateToChapter, headerSlot }: GuidesTableOfContentsProps) {
  const [query, setQuery] = useState("");
  const tocQuery = useGuidesToc(lang);
  const searchIndexQuery = useGuidesSearchIndex(lang);
  const results = useGuidesSearch(searchIndexQuery.data, query);
  const isSearching = query.trim().length > 0;

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <header className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">{tocQuery.data?.meta.title ?? "Guides"}</h1>
          {headerSlot}
        </div>
        {tocQuery.data?.meta.subtitle && (
          <p className="text-muted-foreground text-sm">{tocQuery.data.meta.subtitle}</p>
        )}
      </header>

      <div className="relative">
        <SearchIcon className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search guides..."
          className="pl-9"
          aria-label="Search guides"
        />
      </div>

      {tocQuery.isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      )}

      {tocQuery.isError && (
        <p className="text-destructive text-sm">
          Could not load the guides table of contents: {(tocQuery.error as Error).message}
        </p>
      )}

      {isSearching ? (
        <SearchResultsList results={results} onNavigateToChapter={onNavigateToChapter} />
      ) : (
        tocQuery.data && (
          <ChapterList chapters={tocQuery.data.chapters} onNavigateToChapter={onNavigateToChapter} />
        )
      )}
    </div>
  );
}

function ChapterList({
  chapters,
  onNavigateToChapter,
}: {
  chapters: TocEntry[];
  onNavigateToChapter: (chapterId: string) => void;
}) {
  if (chapters.length === 0) {
    return <p className="text-muted-foreground text-sm">No chapters yet.</p>;
  }
  return (
    <ul className="space-y-2">
      {chapters.map((chapter) => (
        <li key={chapter.id}>
          <button
            type="button"
            onClick={() => onNavigateToChapter(chapter.id)}
            className="hover:bg-accent w-full rounded-md border p-4 text-left transition-colors"
          >
            <div className="flex items-center gap-2">
              <BookOpenIcon className="text-muted-foreground size-4 shrink-0" />
              <span className="font-medium">{chapter.title}</span>
              <Badge variant="outline" className="ml-auto shrink-0">
                {chapter.stepCount} steps
              </Badge>
            </div>
            {chapter.intro && <p className="text-muted-foreground mt-1 text-sm">{chapter.intro}</p>}
          </button>
        </li>
      ))}
    </ul>
  );
}

function SearchResultsList({
  results,
  onNavigateToChapter,
}: {
  results: SearchEntry[];
  onNavigateToChapter: (chapterId: string, stepKey?: string) => void;
}) {
  if (results.length === 0) {
    return <p className="text-muted-foreground text-sm">No matching topics.</p>;
  }
  return (
    <ul className="space-y-2">
      {results.map((entry) => (
        <li key={entry.stepId}>
          <button
            type="button"
            onClick={() => onNavigateToChapter(entry.chapterId, entry.stepKey)}
            className="hover:bg-accent w-full rounded-md border p-4 text-left transition-colors"
          >
            <div className="flex items-center gap-2">
              <span className="font-medium">{entry.title}</span>
              <Badge variant="secondary" className="ml-auto shrink-0">
                {entry.chapterTitle}
              </Badge>
            </div>
            {entry.snippet && <p className="text-muted-foreground mt-1 text-sm">{entry.snippet}</p>}
          </button>
        </li>
      ))}
    </ul>
  );
}
