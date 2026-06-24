import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SearchCustomer } from "./search-customer";

// cmdk (used inside SearchCustomer) calls ResizeObserver, which jsdom lacks.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

// SearchCustomer fetches over the network; stub the API so the query resolves to
// an empty result set (the "no customers found" path that surfaces the button).
const fuzzySearchCustomers = vi.fn();
vi.mock("@/api/customers", () => ({
  fuzzySearchCustomers: (...args: unknown[]) => fuzzySearchCustomers(...args),
  getCustomerById: vi.fn(),
}));
vi.mock("@/api/orders", () => ({
  getPendingOrdersByCustomer: vi.fn(),
}));

function renderSearch(props: Partial<React.ComponentProps<typeof SearchCustomer>>) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <SearchCustomer
        onCustomerFound={vi.fn()}
        onHandleClear={vi.fn()}
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("SearchCustomer — create-new empty state", () => {
  beforeEach(() => {
    fuzzySearchCustomers.mockReset();
    localStorage.clear();
  });

  it("offers 'Create new customer' on no results and hands the query back without clearing the parent form", async () => {
    fuzzySearchCustomers.mockResolvedValue({ data: [], count: 0 });
    const onCreateNew = vi.fn();
    const onHandleClear = vi.fn();
    const user = userEvent.setup();

    renderSearch({ onCreateNew, onHandleClear });

    await user.type(
      screen.getByPlaceholderText("Search name, mobile, or nickname"),
      "66094490",
    );

    // The button appears only after the debounced query resolves empty.
    const btn = await screen.findByRole(
      "button",
      { name: /create new customer/i },
      { timeout: 2000 },
    );

    await user.click(btn);

    expect(onCreateNew).toHaveBeenCalledTimes(1);
    expect(onCreateNew).toHaveBeenCalledWith("66094490");
    // Must NOT call the parent's clear (that would wipe the seeded demographics).
    expect(onHandleClear).not.toHaveBeenCalled();
  });

  it("hides the button when onCreateNew is not provided", async () => {
    fuzzySearchCustomers.mockResolvedValue({ data: [], count: 0 });
    const user = userEvent.setup();

    renderSearch({});

    await user.type(
      screen.getByPlaceholderText("Search name, mobile, or nickname"),
      "66094490",
    );

    await waitFor(
      () =>
        expect(
          screen.getByText(/No customers found matching/i),
        ).toBeInTheDocument(),
      { timeout: 2000 },
    );
    expect(
      screen.queryByRole("button", { name: /create new customer/i }),
    ).not.toBeInTheDocument();
  });
});
