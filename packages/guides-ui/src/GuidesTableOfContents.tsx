import type { ReactNode } from "react";
import { useState } from "react";
import { BookOpenIcon, ChevronDownIcon, SearchIcon } from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Input } from "@repo/ui/input";
import { cn } from "@repo/ui/lib/utils";
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
  onNavigateToChapter: (chapterId: string, stepKey?: string) => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  if (chapters.length === 0) {
    return <p className="text-muted-foreground text-sm">No chapters yet.</p>;
  }

  function toggle(chapterId: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(chapterId)) next.delete(chapterId);
      else next.add(chapterId);
      return next;
    });
  }

  return (
    <ul className="space-y-2">
      {chapters.map((chapter) => {
        const isOpen = expanded.has(chapter.id);
        return (
          <li key={chapter.id} className="rounded-md border">
            <div className="flex items-center">
              <button
                type="button"
                onClick={() => onNavigateToChapter(chapter.id)}
                className="hover:bg-accent flex flex-1 items-center gap-2 rounded-l-md p-4 text-left transition-colors"
              >
                <BookOpenIcon className="text-muted-foreground size-4 shrink-0" />
                <span className="font-medium">{chapter.title}</span>
                <Badge variant="outline" className="ml-auto shrink-0">
                  {chapter.stepCount} steps
                </Badge>
              </button>
              {chapter.steps.length > 0 && (
                <button
                  type="button"
                  onClick={() => toggle(chapter.id)}
                  aria-label={isOpen ? `Hide steps for ${chapter.title}` : `Show steps for ${chapter.title}`}
                  aria-expanded={isOpen}
                  className="hover:bg-accent shrink-0 rounded-r-md p-4 transition-colors"
                >
                  <ChevronDownIcon
                    className={cn("text-muted-foreground size-4 transition-transform", isOpen && "rotate-180")}
                  />
                </button>
              )}
            </div>
            {isOpen && (
              <ol className="space-y-1 border-t px-4 py-2">
                {chapter.steps.map((step, i) => (
                  <li key={step.key}>
                    <button
                      type="button"
                      onClick={() => onNavigateToChapter(chapter.id, step.key)}
                      className="hover:bg-accent flex w-full items-baseline gap-2 rounded px-2 py-1.5 text-left text-sm transition-colors"
                    >
                      <span className="text-muted-foreground w-5 shrink-0 text-right text-xs">{i + 1}.</span>
                      <span>{step.title}</span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </li>
        );
      })}
    </ul>
  );
}

type SearchGroup = {
  chapterId: string;
  chapterTitle: string;
  entries: SearchEntry[];
};

/** Groups matches under their chapter, preserving Fuse's relevance order across groups. */
function groupSearchResults(results: SearchEntry[]): SearchGroup[] {
  const groups: SearchGroup[] = [];
  const byChapterId = new Map<string, SearchGroup>();
  for (const entry of results) {
    let group = byChapterId.get(entry.chapterId);
    if (!group) {
      group = { chapterId: entry.chapterId, chapterTitle: entry.chapterTitle, entries: [] };
      byChapterId.set(entry.chapterId, group);
      groups.push(group);
    }
    group.entries.push(entry);
  }
  return groups;
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
  const groups = groupSearchResults(results);
  return (
    <ul className="space-y-2">
      {groups.map((group) => (
        <li key={group.chapterId} className="rounded-md border">
          <button
            type="button"
            onClick={() => onNavigateToChapter(group.chapterId)}
            className="hover:bg-accent flex w-full items-center gap-2 rounded-t-md p-4 text-left transition-colors"
          >
            <BookOpenIcon className="text-muted-foreground size-4 shrink-0" />
            <span className="font-medium">{group.chapterTitle}</span>
          </button>
          <ol className="space-y-1 border-t px-4 py-2">
            {group.entries.map((entry) => (
              <li key={entry.stepId}>
                <button
                  type="button"
                  onClick={() => onNavigateToChapter(entry.chapterId, entry.stepKey)}
                  className="hover:bg-accent w-full rounded px-2 py-1.5 text-left text-sm transition-colors"
                >
                  <span>{entry.title}</span>
                  {entry.snippet && <p className="text-muted-foreground mt-0.5 text-xs">{entry.snippet}</p>}
                </button>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ul>
  );
}
