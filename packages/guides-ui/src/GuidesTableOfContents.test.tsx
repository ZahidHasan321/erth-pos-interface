import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidesTableOfContents } from "./GuidesTableOfContents";
import { useGuidesSearchIndex, useGuidesToc } from "./content-client";
import type { SearchEntry, Toc } from "./types";

vi.mock("./content-client", () => ({
  useGuidesToc: vi.fn(),
  useGuidesSearchIndex: vi.fn(),
}));

const toc: Toc = {
  meta: { lang: "en", dir: "ltr", title: "Order Processing Manual", subtitle: "The lifecycle of a work order" },
  chapters: [
    {
      id: "01-take-order",
      order: 1,
      app: "shop",
      title: "Creating a work order",
      intro: "How to open a new order.",
      stepCount: 9,
      steps: [
        { key: "open-from-sidebar", title: "Open the New Work Order form" },
        { key: "duplicate-block", title: "Resolving a mobile number already on file" },
      ],
    },
    {
      id: "03-dispatch",
      order: 3,
      app: "shop",
      title: "Dispatch to workshop",
      intro: "Sending garments to the workshop.",
      stepCount: 5,
      steps: [{ key: "new-orders-tab", title: "Open the new orders tab" }],
    },
  ],
};

const searchIndex: SearchEntry[] = [
  {
    chapterId: "01-take-order",
    chapterTitle: "Creating a work order",
    stepId: "01-take-order.duplicate-block",
    stepKey: "duplicate-block",
    title: "Resolving a mobile number already on file",
    snippet: "Where the number entered belongs to an existing customer, the form is blocked.",
    app: "shop",
  },
];

function mockHooks(
  opts: {
    tocData?: Toc | undefined;
    tocLoading?: boolean;
    tocError?: Error | null;
    searchData?: SearchEntry[] | undefined;
  } = {},
) {
  const { tocData = toc, tocLoading = false, tocError = null, searchData = searchIndex } = opts;
  vi.mocked(useGuidesToc).mockReturnValue({
    data: tocData,
    isLoading: tocLoading,
    isError: Boolean(tocError),
    error: tocError,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
  vi.mocked(useGuidesSearchIndex).mockReturnValue({
    data: searchData,
    isLoading: false,
    isError: false,
    error: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

describe("GuidesTableOfContents", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the chapter list with title, intro and step count", () => {
    mockHooks();
    render(<GuidesTableOfContents lang="en" onNavigateToChapter={vi.fn()} />);

    expect(screen.getByText("Creating a work order")).toBeInTheDocument();
    expect(screen.getByText("How to open a new order.")).toBeInTheDocument();
    expect(screen.getByText("9 steps")).toBeInTheDocument();
    expect(screen.getByText("Dispatch to workshop")).toBeInTheDocument();
  });

  it("navigates to a chapter when it's clicked", async () => {
    mockHooks();
    const onNavigateToChapter = vi.fn();
    render(<GuidesTableOfContents lang="en" onNavigateToChapter={onNavigateToChapter} />);

    await userEvent.click(screen.getByText("Creating a work order"));
    expect(onNavigateToChapter).toHaveBeenCalledWith("01-take-order");
  });

  it("lists each chapter's steps and navigates to the matching chapter+step when one is clicked", async () => {
    mockHooks();
    const onNavigateToChapter = vi.fn();
    render(<GuidesTableOfContents lang="en" onNavigateToChapter={onNavigateToChapter} />);

    expect(screen.getByText("Open the New Work Order form")).toBeInTheDocument();
    expect(screen.getByText("Open the new orders tab")).toBeInTheDocument();

    await userEvent.click(screen.getByText("Resolving a mobile number already on file"));
    expect(onNavigateToChapter).toHaveBeenCalledWith("01-take-order", "duplicate-block");
  });

  it("switches to search results when typing, hiding the chapter list", async () => {
    mockHooks();
    render(<GuidesTableOfContents lang="en" onNavigateToChapter={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Search guides"), "mobile number");

    expect(screen.getByText("Resolving a mobile number already on file")).toBeInTheDocument();
    expect(screen.queryByText("Dispatch to workshop")).not.toBeInTheDocument();
  });

  it("navigates to the matching chapter+step when a search result is clicked", async () => {
    mockHooks();
    const onNavigateToChapter = vi.fn();
    render(<GuidesTableOfContents lang="en" onNavigateToChapter={onNavigateToChapter} />);

    await userEvent.type(screen.getByLabelText("Search guides"), "mobile number");
    await userEvent.click(screen.getByText("Resolving a mobile number already on file"));

    expect(onNavigateToChapter).toHaveBeenCalledWith("01-take-order", "duplicate-block");
  });

  it("shows a no-match message when the search has no results", async () => {
    mockHooks();
    render(<GuidesTableOfContents lang="en" onNavigateToChapter={vi.fn()} />);

    await userEvent.type(screen.getByLabelText("Search guides"), "zzz-nonexistent-zzz");
    expect(screen.getByText("No matching topics.")).toBeInTheDocument();
  });

  it("shows an error message when the toc fails to load", () => {
    mockHooks({ tocData: undefined, tocError: new Error("network down") });
    render(<GuidesTableOfContents lang="en" onNavigateToChapter={vi.fn()} />);
    expect(screen.getByText(/network down/)).toBeInTheDocument();
  });
});
