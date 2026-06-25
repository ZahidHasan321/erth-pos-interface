import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useForm, useWatch } from "react-hook-form";
import { CustomerDemographicsForm } from "./customer-demographics-form";
import {
  customerDemographicsDefaults,
  type CustomerDemographicsSchema,
} from "./demographics-form.schema";

// radix Select + cmdk need DOM APIs jsdom lacks.
beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  window.scrollTo = vi.fn();
});

const findAccountsByPhone = vi.fn();
const getCustomerById = vi.fn();
vi.mock("@/api/customers", () => ({
  findAccountsByPhone: (...a: unknown[]) => findAccountsByPhone(...a),
  getCustomerById: (...a: unknown[]) => getCustomerById(...a),
  createCustomer: vi.fn(),
  updateCustomer: vi.fn(),
}));
vi.mock("@/api/orders", () => ({
  getPendingOrdersByCustomer: vi.fn(),
}));

// Exposes the live form values so the test can assert the committed link.
function Harness() {
  const form = useForm<CustomerDemographicsSchema>({
    defaultValues: customerDemographicsDefaults,
  });
  const vals = useWatch({ control: form.control });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return (
    <QueryClientProvider client={client}>
      <CustomerDemographicsForm form={form} onCustomerChange={vi.fn()} />
      <div data-testid="vals">
        {JSON.stringify({
          account_type: vals.account_type,
          primary_customer_id: vals.primary_customer_id,
          relation: vals.relation,
        })}
      </div>
    </QueryClientProvider>
  );
}

const PRIMARY_MATCH = {
  id: 42,
  name: "Ghazi Al Refai",
  phone: "+96566094490",
  account_type: "Primary" as const,
  primary_customer_id: null,
  resolved_primary_id: 42,
  resolved_primary_name: "Ghazi Al Refai",
};

function vals() {
  return JSON.parse(screen.getByTestId("vals").textContent || "{}");
}

describe("CustomerDemographicsForm — link as family member", () => {
  beforeEach(() => {
    findAccountsByPhone.mockReset();
    getCustomerById.mockReset();
    getCustomerById.mockResolvedValue({
      status: "success",
      data: { id: 42, name: "Ghazi Al Refai", account_type: "Primary" },
    });
  });

  async function openDuplicateDialog(user: ReturnType<typeof userEvent.setup>) {
    findAccountsByPhone.mockResolvedValue({
      status: "success",
      data: [PRIMARY_MATCH],
    });
    await user.type(
      screen.getByPlaceholderText("Enter mobile number"),
      "66094490",
    );
    return screen.findByRole(
      "dialog",
      undefined,
      { timeout: 2000 },
    );
  }

  it("requires a relation: the link is gated until one is chosen, then commits Secondary + primary + relation", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness />);

    const dialog = await openDuplicateDialog(user);

    // Step 1: choose "Family member".
    await user.click(
      await within(dialog).findByRole("button", { name: /family member/i }),
    );

    // Step 2: the commit button is disabled until a relation is chosen.
    const linkBtn = await within(dialog).findByRole("button", {
      name: /link as family member/i,
    });
    expect(linkBtn).toBeDisabled();
    // Nothing committed yet.
    expect(vals().account_type).toBe("Primary");

    // Pick a relation from the radix Select (its trigger has role combobox).
    await user.click(within(dialog).getByRole("combobox"));
    await user.click(await screen.findByRole("option", { name: "Brother" }));

    expect(linkBtn).toBeEnabled();
    await user.click(linkBtn);

    // The committed link carries all three required fields.
    await waitFor(() => {
      expect(vals()).toMatchObject({
        account_type: "Secondary",
        primary_customer_id: 42,
        relation: "Brother",
      });
    });
  });

  it("does not auto-commit a Secondary without a relation when the dialog opens", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness />);

    await openDuplicateDialog(user);

    // Just opening the duplicate dialog must not silently flip the account.
    expect(vals()).toMatchObject({
      account_type: "Primary",
      primary_customer_id: null,
    });
  });
});
