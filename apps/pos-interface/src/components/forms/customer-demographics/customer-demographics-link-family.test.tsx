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
function Harness({
  initial,
  client: injected,
  isEditing = true,
}: {
  initial?: Partial<CustomerDemographicsSchema>;
  client?: QueryClient;
  isEditing?: boolean;
}) {
  const form = useForm<CustomerDemographicsSchema>({
    defaultValues: { ...customerDemographicsDefaults, ...initial },
  });
  const vals = useWatch({ control: form.control });
  const client =
    injected ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={client}>
      <CustomerDemographicsForm
        form={form}
        onCustomerChange={vi.fn()}
        initialIsEditing={isEditing}
      />
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

// SPEC §5: "linked family may share or differ on mobile". So an account that
// shares its number with its OWN family is not a duplicate, and must not be
// blocked from editing. Only an unrelated account on that number is.
describe("CustomerDemographicsForm — a linked family sharing one mobile", () => {
  // FGE (Primary) and his son RAKAN (Secondary of FGE) both on 99111693.
  const FGE = {
    id: 287,
    name: "FGE",
    phone: "99111693",
    account_type: "Primary" as const,
    primary_customer_id: null,
    resolved_primary_id: 287,
    resolved_primary_name: "FGE",
  };
  const RAKAN = {
    id: 965,
    name: "RAKAN",
    phone: "99111693",
    account_type: "Secondary" as const,
    primary_customer_id: 287,
    resolved_primary_id: 287,
    resolved_primary_name: "FGE",
  };

  beforeEach(() => {
    findAccountsByPhone.mockReset();
    getCustomerById.mockReset();
    getCustomerById.mockResolvedValue({
      status: "success",
      data: { id: 287, name: "FGE", account_type: "Primary" },
    });
    findAccountsByPhone.mockResolvedValue({
      status: "success",
      data: [FGE, RAKAN],
    });
  });

  // Probe the number, then give the (debounced) duplicate effect room to run.
  async function probePhone(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByPlaceholderText("Enter mobile number"), "99111693");
    await waitFor(() => expect(findAccountsByPhone).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 50));
  }

  it("does not flag the Primary as a duplicate of his own Secondary", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(<Harness initial={{ id: 287, account_type: "Primary", phone: "" }} />);

    await probePhone(user);

    expect(screen.queryByRole("dialog")).toBeNull();
    // ...and the Primary stays saveable.
    expect(screen.getByRole("button", { name: /save/i })).toBeEnabled();
  });

  it("does not flag the Secondary as a duplicate of his own Primary", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <Harness
        initial={{
          id: 965,
          account_type: "Secondary",
          primary_customer_id: 287,
          relation: "Son",
          phone: "",
        }}
      />,
    );

    await probePhone(user);

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  // The reported symptom: staff probed 99111693 earlier in the session (React
  // Query caches it under ["phoneMatches", phone]), then merely OPENED FGE.
  // useQuery replays the cached matches even though it is disabled, so the
  // duplicate effect runs with no typing at all.
  it("does not pop the duplicate dialog just for opening the Primary read-only", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    client.setQueryData(["phoneMatches", "99111693"], {
      status: "success",
      data: [FGE, RAKAN],
    });

    render(
      <Harness
        client={client}
        isEditing={false}
        initial={{ id: 287, account_type: "Primary", phone: "99111693" }}
      />,
    );

    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(findAccountsByPhone).not.toHaveBeenCalled();
  });

  it("still flags an unrelated account on the same number", async () => {
    const user = userEvent.setup({ pointerEventsCheck: 0 });
    // A different Primary (999) editing his own record onto the family's number.
    render(<Harness initial={{ id: 999, account_type: "Primary", phone: "" }} />);

    await probePhone(user);

    expect(await screen.findByRole("dialog", undefined, { timeout: 2000 })).toBeTruthy();
  });
});
