import { describe, expect, it } from "vitest";
import { searchGuides } from "./search";
import type { SearchEntry } from "./types";

const index: SearchEntry[] = [
  {
    chapterId: "01-take-order",
    chapterTitle: "Creating a work order",
    stepId: "01-take-order.enter-mobile",
    stepKey: "enter-mobile",
    title: "Enter the mobile number",
    snippet: "Retain the default country code, Kuwait +965, unless the customer holds a foreign number.",
    app: "shop",
  },
  {
    chapterId: "01-take-order",
    chapterTitle: "Creating a work order",
    stepId: "01-take-order.duplicate-block",
    stepKey: "duplicate-block",
    title: "Resolving a mobile number already on file",
    snippet: "Where the number entered belongs to an existing customer, the form is blocked.",
    app: "shop",
  },
  {
    chapterId: "03-dispatch",
    chapterTitle: "Dispatch to workshop",
    stepId: "03-dispatch.select-order",
    stepKey: "select-order",
    title: "Select the order",
    snippet: "Choose an order from the queue to dispatch.",
    app: "shop",
  },
];

describe("searchGuides", () => {
  it("returns nothing for an empty or whitespace-only query", () => {
    expect(searchGuides(index, "")).toEqual([]);
    expect(searchGuides(index, "   ")).toEqual([]);
  });

  it("matches on step title", () => {
    const results = searchGuides(index, "mobile number");
    expect(results.map((r) => r.stepId)).toContain("01-take-order.enter-mobile");
  });

  it("matches on snippet text even when the title doesn't contain the term", () => {
    const results = searchGuides(index, "existing customer");
    expect(results.map((r) => r.stepId)).toContain("01-take-order.duplicate-block");
  });

  it("ranks an exact title match first", () => {
    const results = searchGuides(index, "Select the order");
    expect(results[0]?.stepId).toBe("03-dispatch.select-order");
  });

  it("respects the limit", () => {
    const results = searchGuides(index, "order", 1);
    expect(results).toHaveLength(1);
  });

  it("returns nothing when nothing matches", () => {
    expect(searchGuides(index, "zzz-nonexistent-topic-zzz")).toEqual([]);
  });
});
