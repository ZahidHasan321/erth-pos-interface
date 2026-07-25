import "@testing-library/jest-dom";

// cmdk (used by @repo/ui's CommandDialog) reads ResizeObserver, which jsdom
// doesn't implement.
class ResizeObserverStub implements ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

// jsdom doesn't implement scrollIntoView; GuidesChapter uses it for deep links.
Element.prototype.scrollIntoView ??= () => {};
