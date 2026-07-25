import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { GuidesSearchDialog } from "./GuidesSearchDialog";
import type { SearchEntry } from "./types";

const index: SearchEntry[] = [
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

describe("GuidesSearchDialog", () => {
  it("prompts to start typing when the query is empty", () => {
    render(<GuidesSearchDialog open onOpenChange={vi.fn()} index={index} onSelect={vi.fn()} />);
    expect(screen.getByText("Start typing to search.")).toBeInTheDocument();
  });

  it("filters results as the user types and shows a no-match message otherwise", async () => {
    render(<GuidesSearchDialog open onOpenChange={vi.fn()} index={index} onSelect={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText("Search guides..."), "mobile number");
    expect(screen.getByText("Resolving a mobile number already on file")).toBeInTheDocument();

    await userEvent.clear(screen.getByPlaceholderText("Search guides..."));
    await userEvent.type(screen.getByPlaceholderText("Search guides..."), "zzz-no-match-zzz");
    expect(screen.getByText("No matching topics.")).toBeInTheDocument();
  });

  it("calls onSelect and closes the dialog when a result is chosen", async () => {
    const onSelect = vi.fn();
    const onOpenChange = vi.fn();
    render(<GuidesSearchDialog open onOpenChange={onOpenChange} index={index} onSelect={onSelect} />);

    await userEvent.type(screen.getByPlaceholderText("Search guides..."), "mobile number");
    await userEvent.click(screen.getByText("Resolving a mobile number already on file"));

    expect(onSelect).toHaveBeenCalledWith(index[0]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("resets the query after the dialog closes and reopens", () => {
    const { rerender } = render(
      <GuidesSearchDialog open onOpenChange={vi.fn()} index={index} onSelect={vi.fn()} />,
    );
    rerender(<GuidesSearchDialog open={false} onOpenChange={vi.fn()} index={index} onSelect={vi.fn()} />);
    rerender(<GuidesSearchDialog open onOpenChange={vi.fn()} index={index} onSelect={vi.fn()} />);

    expect(screen.getByPlaceholderText("Search guides...")).toHaveValue("");
  });
});
