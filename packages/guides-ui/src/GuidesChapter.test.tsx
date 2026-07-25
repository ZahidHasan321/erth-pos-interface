import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidesChapter } from "./GuidesChapter";
import { useGuideChapter, useGuidesSearchIndex } from "./content-client";
import type { ChapterDetail, SearchEntry } from "./types";

vi.mock("./content-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./content-client")>();
  return {
    ...actual,
    useGuideChapter: vi.fn(),
    useGuidesSearchIndex: vi.fn(),
  };
});

const chapter: ChapterDetail = {
  id: "01-take-order",
  order: 1,
  app: "shop",
  title: "Creating a work order",
  intro: "A work order is created on the New Work Order form.",
  steps: [
    {
      id: "01-take-order.open-from-sidebar",
      key: "open-from-sidebar",
      title: "Open the form",
      body: "Select New Work Order (1).",
      image: "shots/01-take-order/01-open-from-sidebar.png",
      marks: 1,
      app: "shop",
      route: "/orders/new-work-order",
    },
    {
      id: "01-take-order.duplicate-block",
      key: "duplicate-block",
      title: "Resolving a duplicate mobile",
      body: "See [[ref:01-take-order.enter-mobile]] for context.",
      image: "shots/01-take-order/02-duplicate.png",
      marks: 0,
      app: "shop",
      route: "/orders/new-work-order",
    },
  ],
};

function mockHooks(
  opts: {
    data?: ChapterDetail | undefined;
    isLoading?: boolean;
    isError?: boolean;
    error?: Error | null;
    searchIndex?: SearchEntry[];
  } = {},
) {
  const { data = chapter, isLoading = false, isError = false, error = null, searchIndex = [] } = opts;
  vi.mocked(useGuideChapter).mockReturnValue({
    data,
    isLoading,
    isError,
    error,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  vi.mocked(useGuidesSearchIndex).mockReturnValue({
    data: searchIndex,
    isLoading: false,
    isError: false,
    error: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("GuidesChapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the chapter title, intro and each step with its image", () => {
    mockHooks();
    render(
      <GuidesChapter
        lang="en"
        chapterId="01-take-order"
        onNavigateToToc={vi.fn()}
        onNavigateToChapter={vi.fn()}
      />,
    );

    expect(screen.getByRole("heading", { name: "Creating a work order" })).toBeInTheDocument();
    expect(screen.getByText("Open the form")).toBeInTheDocument();
    expect(screen.getByAltText("Open the form")).toHaveAttribute(
      "src",
      "/guides/shots/01-take-order/01-open-from-sidebar.png",
    );
  });

  it("calls onNavigateToToc when the back button is clicked", async () => {
    mockHooks();
    const onNavigateToToc = vi.fn();
    render(
      <GuidesChapter
        lang="en"
        chapterId="01-take-order"
        onNavigateToToc={onNavigateToToc}
        onNavigateToChapter={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /table of contents/i }));
    expect(onNavigateToToc).toHaveBeenCalled();
  });

  it("opens the search dialog when the search button is clicked", async () => {
    mockHooks();
    render(
      <GuidesChapter
        lang="en"
        chapterId="01-take-order"
        onNavigateToToc={vi.fn()}
        onNavigateToChapter={vi.fn()}
      />,
    );

    await userEvent.click(screen.getByRole("button", { name: /^search$/i }));
    expect(screen.getByPlaceholderText("Search guides...")).toBeInTheDocument();
  });

  it("expands a step image into a lightbox on click", async () => {
    mockHooks();
    render(
      <GuidesChapter
        lang="en"
        chapterId="01-take-order"
        onNavigateToToc={vi.fn()}
        onNavigateToChapter={vi.fn()}
      />,
    );

    expect(screen.getAllByAltText("Open the form")).toHaveLength(1);

    await userEvent.click(screen.getAllByAltText("Open the form")[0]!);

    // Thumbnail plus the full-size copy inside the opened dialog.
    expect(screen.getAllByAltText("Open the form")).toHaveLength(2);
  });

  it("resolves a [[ref:...]] in a step body into a clickable link that navigates", async () => {
    mockHooks();
    const onNavigateToChapter = vi.fn();
    render(
      <GuidesChapter
        lang="en"
        chapterId="01-take-order"
        onNavigateToToc={vi.fn()}
        onNavigateToChapter={onNavigateToChapter}
      />,
    );

    const link = screen.getByRole("button", { name: "01-take-order.enter-mobile" });
    await userEvent.click(link);
    expect(onNavigateToChapter).toHaveBeenCalledWith("01-take-order", "enter-mobile");
  });

  it("shows an error message when the chapter fails to load", () => {
    mockHooks({ data: undefined, isError: true, error: new Error("not found") });
    render(
      <GuidesChapter
        lang="en"
        chapterId="missing"
        onNavigateToToc={vi.fn()}
        onNavigateToChapter={vi.fn()}
      />,
    );
    expect(screen.getByText(/not found/)).toBeInTheDocument();
  });
});
