import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { resolveRefs } from "./resolve-refs";

describe("resolveRefs", () => {
  it("renders plain text unchanged when there are no refs", () => {
    render(<p>{resolveRefs("Just plain prose.", { onNavigate: vi.fn() })}</p>);
    expect(screen.getByText("Just plain prose.")).toBeInTheDocument();
  });

  it("turns a well-formed ref into a clickable link using the resolved title", () => {
    const titleFor = vi.fn(() => "Resolving a mobile number already on file");
    render(
      <p>
        {resolveRefs("see section [[ref:01-take-order.duplicate-block]].", {
          onNavigate: vi.fn(),
          titleFor,
        })}
      </p>,
    );

    expect(screen.getByText(/see section/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Resolving a mobile number already on file" }),
    ).toBeInTheDocument();
    expect(titleFor).toHaveBeenCalledWith("01-take-order", "duplicate-block");
  });

  it("navigates with the parsed chapter/step when the link is clicked", async () => {
    const onNavigate = vi.fn();
    render(<p>{resolveRefs("[[ref:01-take-order.duplicate-block]]", { onNavigate })}</p>);

    await userEvent.click(screen.getByRole("button"));
    expect(onNavigate).toHaveBeenCalledWith("01-take-order", "duplicate-block");
  });

  it("falls back to the raw chapter.step id as the label when no title lookup is given", () => {
    render(<p>{resolveRefs("[[ref:01-take-order.duplicate-block]]", { onNavigate: vi.fn() })}</p>);
    expect(screen.getByRole("button", { name: "01-take-order.duplicate-block" })).toBeInTheDocument();
  });

  it("leaves a malformed ref (missing a dot) as inert literal text, without throwing", () => {
    const onNavigate = vi.fn();
    expect(() =>
      render(<p>{resolveRefs("see [[ref:noformat]] for details", { onNavigate })}</p>),
    ).not.toThrow();
    expect(screen.getByText(/\[\[ref:noformat\]\]/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("resolves multiple refs within the same body", () => {
    render(<p>{resolveRefs("First [[ref:a.one]] then [[ref:b.two]].", { onNavigate: vi.fn() })}</p>);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
});
