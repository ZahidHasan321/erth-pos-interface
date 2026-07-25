import { describe, expect, it } from "vitest";
import { parseChapterSearch } from "./chapter-search";

describe("parseChapterSearch", () => {
  it("passes through a string step", () => {
    expect(parseChapterSearch({ step: "duplicate-block" })).toEqual({ step: "duplicate-block" });
  });

  it("drops a non-string step rather than passing it through", () => {
    expect(parseChapterSearch({ step: 123 })).toEqual({ step: undefined });
    expect(parseChapterSearch({ step: ["x"] })).toEqual({ step: undefined });
  });

  it("defaults to undefined when step is absent", () => {
    expect(parseChapterSearch({})).toEqual({ step: undefined });
  });
});
