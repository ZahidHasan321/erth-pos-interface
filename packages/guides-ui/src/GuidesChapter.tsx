import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeftIcon, SearchIcon } from "lucide-react";
import { Badge } from "@repo/ui/badge";
import { Button } from "@repo/ui/button";
import { cn } from "@repo/ui/lib/utils";
import { Skeleton } from "@repo/ui/skeleton";
import { guideImageUrl, useGuideChapter, useGuidesSearchIndex } from "./content-client";
import { GuidesSearchDialog } from "./GuidesSearchDialog";
import { ImageLightbox } from "./ImageLightbox";
import { resolveRefs } from "./resolve-refs";

export type GuidesChapterProps = {
  lang: string;
  chapterId: string;
  /** Deep-links to and highlights this step once the chapter loads. */
  stepKey?: string;
  onNavigateToToc: () => void;
  onNavigateToChapter: (chapterId: string, stepKey?: string) => void;
  headerSlot?: ReactNode;
};

export function GuidesChapter({
  lang,
  chapterId,
  stepKey,
  onNavigateToToc,
  onNavigateToChapter,
  headerSlot,
}: GuidesChapterProps) {
  const [searchOpen, setSearchOpen] = useState(false);
  const chapterQuery = useGuideChapter(lang, chapterId);
  const searchIndexQuery = useGuidesSearchIndex(lang);

  const titleFor = useMemo(() => {
    const index = searchIndexQuery.data;
    return (refChapterId: string, refStepKey: string): string | undefined =>
      index?.find((e) => e.chapterId === refChapterId && e.stepKey === refStepKey)?.title;
  }, [searchIndexQuery.data]);

  useEffect(() => {
    if (!stepKey || !chapterQuery.data) return;
    document.getElementById(`step-${stepKey}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [stepKey, chapterQuery.data]);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" size="sm" onClick={onNavigateToToc}>
          <ArrowLeftIcon /> Table of contents
        </Button>
        <div className="flex items-center gap-2">
          {headerSlot}
          <Button variant="outline" size="sm" onClick={() => setSearchOpen(true)}>
            <SearchIcon /> Search
          </Button>
        </div>
      </div>

      {chapterQuery.isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      )}

      {chapterQuery.isError && (
        <p className="text-destructive text-sm">
          Could not load this chapter: {(chapterQuery.error as Error).message}
        </p>
      )}

      {chapterQuery.data && (
        <>
          <header>
            <h1 className="text-2xl font-semibold">{chapterQuery.data.title}</h1>
            {chapterQuery.data.intro && (
              <p className="text-muted-foreground mt-1">{chapterQuery.data.intro}</p>
            )}
          </header>

          <ol className="space-y-8">
            {chapterQuery.data.steps.map((step, i) => (
              <li
                key={step.id}
                id={`step-${step.key}`}
                className={cn(
                  "scroll-mt-24 rounded-md border p-4",
                  stepKey === step.key && "ring-primary ring-2",
                )}
              >
                <div className="flex items-center gap-2">
                  <span className="text-primary text-xs font-semibold">{i + 1}</span>
                  <h2 className="font-medium">{step.title}</h2>
                  <Badge variant="outline" className="ml-auto shrink-0 capitalize">
                    {step.app}
                  </Badge>
                </div>
                {step.body && (
                  <p className="text-muted-foreground mt-2 text-sm">
                    {resolveRefs(step.body, { onNavigate: onNavigateToChapter, titleFor })}
                  </p>
                )}
                <div className="mt-3">
                  <ImageLightbox src={guideImageUrl(step.image)} alt={step.title} />
                </div>
              </li>
            ))}
          </ol>
        </>
      )}

      <GuidesSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        index={searchIndexQuery.data}
        onSelect={(entry) => onNavigateToChapter(entry.chapterId, entry.stepKey)}
      />
    </div>
  );
}
