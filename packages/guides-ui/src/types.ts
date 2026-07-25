export type GuideApp = "shop" | "workshop";

export type TocEntry = {
  id: string;
  order: number;
  app: GuideApp;
  title: string;
  intro: string;
  stepCount: number;
};

export type Toc = {
  meta: { lang: string; dir: string; title: string; subtitle: string };
  chapters: TocEntry[];
};

export type SearchEntry = {
  chapterId: string;
  chapterTitle: string;
  stepId: string;
  stepKey: string;
  title: string;
  snippet: string;
  app: GuideApp;
};

export type ChapterDetailStep = {
  id: string;
  key: string;
  title: string;
  body: string;
  image: string;
  marks: number;
  app: GuideApp;
  route: string;
};

export type ChapterDetail = {
  id: string;
  order: number;
  app: GuideApp;
  title: string;
  intro: string;
  steps: ChapterDetailStep[];
};
