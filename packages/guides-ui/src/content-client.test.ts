import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchGuideChapter, fetchGuidesSearchIndex, fetchGuidesToc, guideImageUrl } from "./content-client";

function mockFetchOnce(status: number, body: unknown) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? "OK" : "Not Found",
    json: async () => body,
  });
}

describe("content-client", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("guideImageUrl prefixes the image path with the guides base path", () => {
    expect(guideImageUrl("shots/01-take-order/01-open.png")).toBe(
      "/guides/shots/01-take-order/01-open.png",
    );
  });

  it("fetchGuidesToc requests the language-specific toc file", async () => {
    mockFetchOnce(200, { meta: { lang: "en" }, chapters: [] });
    const toc = await fetchGuidesToc("en");
    expect(fetch).toHaveBeenCalledWith("/guides/app-content/toc.en.json");
    expect(toc.chapters).toEqual([]);
  });

  it("fetchGuidesSearchIndex requests the language-specific search index file", async () => {
    mockFetchOnce(200, []);
    await fetchGuidesSearchIndex("hi");
    expect(fetch).toHaveBeenCalledWith("/guides/app-content/search-index.hi.json");
  });

  it("fetchGuideChapter requests the language- and chapter-specific file", async () => {
    mockFetchOnce(200, { id: "01-take-order", steps: [] });
    await fetchGuideChapter("en", "01-take-order");
    expect(fetch).toHaveBeenCalledWith("/guides/app-content/chapters/en/01-take-order.json");
  });

  it("throws a descriptive error naming what failed and the response status when the fetch is not ok", async () => {
    mockFetchOnce(404, {});
    await expect(fetchGuideChapter("en", "missing-chapter")).rejects.toThrow(
      /guide chapter "missing-chapter".*404/,
    );
  });
});
