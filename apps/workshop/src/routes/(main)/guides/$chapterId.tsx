import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GuidesChapter, LanguageToggle, useGuidesLanguage } from "@repo/guides-ui";
import { parseChapterSearch } from "./chapter-search";

export const Route = createFileRoute("/(main)/guides/$chapterId")({
  component: GuidesChapterPage,
  head: () => ({ meta: [{ title: "Guides" }] }),
  validateSearch: parseChapterSearch,
});

function GuidesChapterPage() {
  const { chapterId } = Route.useParams();
  const { step } = Route.useSearch();
  const navigate = useNavigate();
  const [lang, setLang] = useGuidesLanguage();

  const onNavigateToToc = useCallback(() => {
    navigate({ to: "/guides" });
  }, [navigate]);

  const onNavigateToChapter = useCallback(
    (targetChapterId: string, stepKey?: string) => {
      navigate({
        to: "/guides/$chapterId",
        params: { chapterId: targetChapterId },
        search: stepKey ? { step: stepKey } : {},
      });
    },
    [navigate],
  );

  return (
    <GuidesChapter
      lang={lang}
      chapterId={chapterId}
      stepKey={step}
      onNavigateToToc={onNavigateToToc}
      onNavigateToChapter={onNavigateToChapter}
      headerSlot={<LanguageToggle lang={lang} onChange={setLang} />}
    />
  );
}
