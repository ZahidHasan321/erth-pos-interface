import { useCallback } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { GuidesTableOfContents, LanguageToggle, useGuidesLanguage } from "@repo/guides-ui";

export const Route = createFileRoute("/$main/guides/")({
  component: GuidesIndexPage,
  head: () => ({ meta: [{ title: "Guides" }] }),
});

function GuidesIndexPage() {
  const navigate = useNavigate();
  const [lang, setLang] = useGuidesLanguage();

  const onNavigateToChapter = useCallback(
    (chapterId: string, stepKey?: string) => {
      navigate({
        to: "/$main/guides/$chapterId",
        params: (prev: Record<string, string>) => ({ ...prev, chapterId }),
        search: stepKey ? { step: stepKey } : {},
      });
    },
    [navigate],
  );

  return (
    <GuidesTableOfContents
      lang={lang}
      onNavigateToChapter={onNavigateToChapter}
      headerSlot={<LanguageToggle lang={lang} onChange={setLang} />}
    />
  );
}
