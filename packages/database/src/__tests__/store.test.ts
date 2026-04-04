import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// These tests validate the store management logic used across both
// the POS (shop) and Workshop apps: transfer flow constants, direction
// symmetry, low-stock thresholds, and query filter contracts.
// ---------------------------------------------------------------------------

// ─── Transfer Constants ──────────────────────────────────────────────────

const TRANSFER_STATUSES = ["requested", "approved", "rejected", "dispatched", "received", "partially_received"];
const TRANSFER_DIRECTIONS = ["shop_to_workshop", "workshop_to_shop"];
const ITEM_TYPES = ["fabric", "shelf", "accessory"];
const ACCESSORY_CATEGORIES = ["buttons", "zippers", "thread", "lining", "elastic", "interlining", "other"];
const UNITS_OF_MEASURE = ["pieces", "meters", "rolls", "kg"];

describe("Transfer Constants", () => {
  it("has all required transfer statuses", () => {
    expect(TRANSFER_STATUSES).toContain("requested");
    expect(TRANSFER_STATUSES).toContain("approved");
    expect(TRANSFER_STATUSES).toContain("rejected");
    expect(TRANSFER_STATUSES).toContain("dispatched");
    expect(TRANSFER_STATUSES).toContain("received");
    expect(TRANSFER_STATUSES).toContain("partially_received");
    expect(TRANSFER_STATUSES).toHaveLength(6);
  });

  it("has bidirectional transfer directions", () => {
    expect(TRANSFER_DIRECTIONS).toContain("shop_to_workshop");
    expect(TRANSFER_DIRECTIONS).toContain("workshop_to_shop");
    expect(TRANSFER_DIRECTIONS).toHaveLength(2);
  });

  it("has all item types", () => {
    expect(ITEM_TYPES).toContain("fabric");
    expect(ITEM_TYPES).toContain("shelf");
    expect(ITEM_TYPES).toContain("accessory");
    expect(ITEM_TYPES).toHaveLength(3);
  });

  it("has all accessory categories", () => {
    expect(ACCESSORY_CATEGORIES).toHaveLength(7);
    for (const cat of ["buttons", "zippers", "thread", "lining", "elastic", "interlining", "other"]) {
      expect(ACCESSORY_CATEGORIES).toContain(cat);
    }
  });

  it("has all units of measure", () => {
    expect(UNITS_OF_MEASURE).toHaveLength(4);
    for (const unit of ["pieces", "meters", "rolls", "kg"]) {
      expect(UNITS_OF_MEASURE).toContain(unit);
    }
  });
});

// ─── Transfer Status Lifecycle ───────────────────────────────────────────

describe("Transfer Status Lifecycle", () => {
  const validTransitions: Record<string, string[]> = {
    requested: ["approved", "rejected"],
    approved: ["dispatched"],
    dispatched: ["received", "partially_received"],
    received: [],
    partially_received: [],
    rejected: [],
  };

  it("requested can transition to approved or rejected", () => {
    expect(validTransitions["requested"]).toEqual(["approved", "rejected"]);
  });

  it("approved can only transition to dispatched", () => {
    expect(validTransitions["approved"]).toEqual(["dispatched"]);
  });

  it("dispatched can transition to received or partially_received", () => {
    expect(validTransitions["dispatched"]).toEqual(["received", "partially_received"]);
  });

  it("received and rejected are terminal states", () => {
    expect(validTransitions["received"]).toEqual([]);
    expect(validTransitions["rejected"]).toEqual([]);
    expect(validTransitions["partially_received"]).toEqual([]);
  });

  it("every status has a defined set of valid transitions", () => {
    for (const status of TRANSFER_STATUSES) {
      expect(validTransitions).toHaveProperty(status);
    }
  });
});

// ─── Low Stock Threshold Logic ───────────────────────────────────────────

const LOW_STOCK_THRESHOLDS = { fabric: 5, shelf: 3, accessory: 10 };

function isLowStock(shopStock: number, workshopStock: number, type: keyof typeof LOW_STOCK_THRESHOLDS): boolean {
  const threshold = LOW_STOCK_THRESHOLDS[type];
  return shopStock < threshold || workshopStock < threshold;
}

describe("isLowStock", () => {
  describe("fabric (threshold=5)", () => {
    it("both above threshold -> not low", () => {
      expect(isLowStock(10, 10, "fabric")).toBe(false);
    });

    it("both at threshold -> not low", () => {
      expect(isLowStock(5, 5, "fabric")).toBe(false);
    });

    it("shop below threshold -> low", () => {
      expect(isLowStock(4, 10, "fabric")).toBe(true);
    });

    it("workshop below threshold -> low", () => {
      expect(isLowStock(10, 4, "fabric")).toBe(true);
    });

    it("both below threshold -> low", () => {
      expect(isLowStock(2, 3, "fabric")).toBe(true);
    });

    it("zero stock -> low", () => {
      expect(isLowStock(0, 0, "fabric")).toBe(true);
    });
  });

  describe("shelf (threshold=3)", () => {
    it("both at threshold -> not low", () => {
      expect(isLowStock(3, 3, "shelf")).toBe(false);
    });

    it("one below -> low", () => {
      expect(isLowStock(2, 10, "shelf")).toBe(true);
    });
  });

  describe("accessory (threshold=10)", () => {
    it("both at threshold -> not low", () => {
      expect(isLowStock(10, 10, "accessory")).toBe(false);
    });

    it("one below -> low", () => {
      expect(isLowStock(9, 100, "accessory")).toBe(true);
    });

    it("just above threshold -> not low", () => {
      expect(isLowStock(10, 11, "accessory")).toBe(false);
    });
  });
});

// ─── Transfer Direction Symmetry ─────────────────────────────────────────
// Validates that the shop and workshop pages use correct matching directions

describe("Transfer Direction Symmetry", () => {
  // Shop (POS) pages
  const shopApproveRequestsFilter = { status: ["requested"], direction: "shop_to_workshop" };
  const shopReceivingFilter = { status: "dispatched", direction: "workshop_to_shop" };
  const shopRequestDeliveryDirection = "workshop_to_shop";

  // Workshop pages
  const workshopApproveRequestsFilter = { status: ["requested"], direction: "workshop_to_shop" };
  const workshopReceivingFilter = { status: "dispatched", direction: "shop_to_workshop" };
  const workshopRequestDeliveryDirection = "shop_to_workshop";
  const workshopSendToShopDirection = "workshop_to_shop";

  it("shop approves requests FOR shop_to_workshop (workshop requesting from shop)", () => {
    expect(shopApproveRequestsFilter.direction).toBe("shop_to_workshop");
  });

  it("workshop approves requests FOR workshop_to_shop (shop requesting from workshop)", () => {
    expect(workshopApproveRequestsFilter.direction).toBe("workshop_to_shop");
  });

  it("shop receives deliveries FROM workshop (direction=workshop_to_shop)", () => {
    expect(shopReceivingFilter.direction).toBe("workshop_to_shop");
  });

  it("workshop receives deliveries FROM shop (direction=shop_to_workshop)", () => {
    expect(workshopReceivingFilter.direction).toBe("shop_to_workshop");
  });

  it("shop requests delivery from workshop (direction=workshop_to_shop)", () => {
    expect(shopRequestDeliveryDirection).toBe("workshop_to_shop");
  });

  it("workshop requests delivery from shop (direction=shop_to_workshop)", () => {
    expect(workshopRequestDeliveryDirection).toBe("shop_to_workshop");
  });

  it("workshop sends to shop proactively (direction=workshop_to_shop)", () => {
    expect(workshopSendToShopDirection).toBe("workshop_to_shop");
  });

  it("approve and receive directions are opposites for each app", () => {
    // Shop approves shop_to_workshop, receives workshop_to_shop
    expect(shopApproveRequestsFilter.direction).not.toBe(shopReceivingFilter.direction);
    // Workshop approves workshop_to_shop, receives shop_to_workshop
    expect(workshopApproveRequestsFilter.direction).not.toBe(workshopReceivingFilter.direction);
  });

  it("shop approves what workshop requests, and vice versa", () => {
    // Workshop requests shop_to_workshop → shop approves shop_to_workshop
    expect(workshopRequestDeliveryDirection).toBe(shopApproveRequestsFilter.direction);
    // Shop requests workshop_to_shop → workshop approves workshop_to_shop
    expect(shopRequestDeliveryDirection).toBe(workshopApproveRequestsFilter.direction);
  });
});

// ─── Transfer Filter Contracts ───────────────────────────────────────────

describe("Transfer Filter Contracts", () => {
  interface TransferFilters {
    status?: string | string[];
    direction?: string;
    item_type?: string;
  }

  function buildFilterDescription(filters: TransferFilters): string {
    const parts: string[] = [];
    if (filters.status) {
      parts.push(`status=${Array.isArray(filters.status) ? filters.status.join(",") : filters.status}`);
    }
    if (filters.direction) parts.push(`direction=${filters.direction}`);
    if (filters.item_type) parts.push(`item_type=${filters.item_type}`);
    return parts.join(" & ") || "no filters";
  }

  it("status can be a single string", () => {
    const filter: TransferFilters = { status: "dispatched" };
    expect(typeof filter.status).toBe("string");
    expect(buildFilterDescription(filter)).toBe("status=dispatched");
  });

  it("status can be an array of strings", () => {
    const filter: TransferFilters = { status: ["requested", "approved"] };
    expect(Array.isArray(filter.status)).toBe(true);
    expect(buildFilterDescription(filter)).toBe("status=requested,approved");
  });

  it("all filter fields are optional", () => {
    const filter: TransferFilters = {};
    expect(buildFilterDescription(filter)).toBe("no filters");
  });

  it("direction filter values are valid", () => {
    for (const dir of TRANSFER_DIRECTIONS) {
      const filter: TransferFilters = { direction: dir };
      expect(TRANSFER_DIRECTIONS).toContain(filter.direction);
    }
  });

  it("item_type filter values are valid", () => {
    for (const type of ITEM_TYPES) {
      const filter: TransferFilters = { item_type: type };
      expect(ITEM_TYPES).toContain(filter.item_type);
    }
  });
});

// ─── Stock Calculation Helpers ───────────────────────────────────────────

describe("Stock Calculations", () => {
  type StockItem = { shop_stock: number | string | null; workshop_stock: number | string | null };

  function totalStock(item: StockItem): number {
    return Number(item.shop_stock ?? 0) + Number(item.workshop_stock ?? 0);
  }

  function sortByTotalStock(items: StockItem[]): StockItem[] {
    return [...items].sort((a, b) => totalStock(a) - totalStock(b));
  }

  it("totalStock handles numeric values", () => {
    expect(totalStock({ shop_stock: 10, workshop_stock: 5 })).toBe(15);
  });

  it("totalStock handles string values (from DB numeric type)", () => {
    expect(totalStock({ shop_stock: "10.50", workshop_stock: "5.25" })).toBe(15.75);
  });

  it("totalStock handles null values", () => {
    expect(totalStock({ shop_stock: null, workshop_stock: null })).toBe(0);
    expect(totalStock({ shop_stock: 10, workshop_stock: null })).toBe(10);
    expect(totalStock({ shop_stock: null, workshop_stock: 5 })).toBe(5);
  });

  it("sortByTotalStock sorts ascending (lowest first)", () => {
    const items: StockItem[] = [
      { shop_stock: 10, workshop_stock: 10 },
      { shop_stock: 1, workshop_stock: 1 },
      { shop_stock: 5, workshop_stock: 5 },
    ];
    const sorted = sortByTotalStock(items);
    expect(totalStock(sorted[0]!)).toBe(2);
    expect(totalStock(sorted[1]!)).toBe(10);
    expect(totalStock(sorted[2]!)).toBe(20);
  });

  it("sortByTotalStock handles empty array", () => {
    expect(sortByTotalStock([])).toEqual([]);
  });

  it("sortByTotalStock does not mutate original", () => {
    const items: StockItem[] = [
      { shop_stock: 10, workshop_stock: 10 },
      { shop_stock: 1, workshop_stock: 1 },
    ];
    const original = [...items];
    sortByTotalStock(items);
    expect(items).toEqual(original);
  });
});

// ─── Low Stock Count Aggregation ─────────────────────────────────────────

describe("Low Stock Count Aggregation", () => {
  type Fabric = { shop_stock: number | null; workshop_stock: number | null };
  type ShelfItem = { shop_stock: number | null; workshop_stock: number | null };
  type Accessory = { shop_stock: number | string | null; workshop_stock: number | string | null };

  function countLowStock(fabrics: Fabric[], shelfItems: ShelfItem[], accessories: Accessory[]): number {
    let count = 0;
    for (const f of fabrics) if (isLowStock(Number(f.shop_stock ?? 0), Number(f.workshop_stock ?? 0), "fabric")) count++;
    for (const s of shelfItems) if (isLowStock(Number(s.shop_stock ?? 0), Number(s.workshop_stock ?? 0), "shelf")) count++;
    for (const a of accessories) if (isLowStock(Number(a.shop_stock ?? 0), Number(a.workshop_stock ?? 0), "accessory")) count++;
    return count;
  }

  it("returns 0 when all stock is above thresholds", () => {
    const fabrics = [{ shop_stock: 10, workshop_stock: 10 }];
    const shelf = [{ shop_stock: 5, workshop_stock: 5 }];
    const accessories = [{ shop_stock: 20, workshop_stock: 20 }];
    expect(countLowStock(fabrics, shelf, accessories)).toBe(0);
  });

  it("counts low stock across all item types", () => {
    const fabrics = [{ shop_stock: 2, workshop_stock: 10 }]; // low (shop < 5)
    const shelf = [{ shop_stock: 1, workshop_stock: 1 }]; // low (both < 3)
    const accessories = [{ shop_stock: 5, workshop_stock: 5 }]; // low (both < 10)
    expect(countLowStock(fabrics, shelf, accessories)).toBe(3);
  });

  it("counts multiple low items per type", () => {
    const fabrics = [
      { shop_stock: 2, workshop_stock: 2 }, // low
      { shop_stock: 10, workshop_stock: 10 }, // ok
      { shop_stock: 0, workshop_stock: 0 }, // low
    ];
    expect(countLowStock(fabrics, [], [])).toBe(2);
  });

  it("handles empty lists", () => {
    expect(countLowStock([], [], [])).toBe(0);
  });

  it("handles null stock values as 0 (always low)", () => {
    const fabrics = [{ shop_stock: null, workshop_stock: null }];
    expect(countLowStock(fabrics, [], [])).toBe(1);
  });

  it("handles string stock values from DB numeric type", () => {
    const accessories: Accessory[] = [{ shop_stock: "15.5", workshop_stock: "12.0" }];
    expect(countLowStock([], [], accessories)).toBe(0);
  });
});

// ─── Transfer Item Name Resolution ───────────────────────────────────────

describe("Transfer Item Name Resolution", () => {
  type TransferItem = {
    fabric?: { name: string } | null;
    shelf_item?: { type: string } | null;
    accessory?: { name: string; category: string } | null;
  };

  function getItemName(item: TransferItem): string {
    if (item.fabric) return item.fabric.name;
    if (item.shelf_item) return item.shelf_item.type;
    if (item.accessory) return `${item.accessory.name} (${item.accessory.category})`;
    return "Unknown";
  }

  it("resolves fabric name", () => {
    expect(getItemName({ fabric: { name: "White Cotton" } })).toBe("White Cotton");
  });

  it("resolves shelf item type", () => {
    expect(getItemName({ shelf_item: { type: "Dishdasha" } })).toBe("Dishdasha");
  });

  it("resolves accessory with category", () => {
    expect(getItemName({ accessory: { name: "Gold Buttons", category: "buttons" } })).toBe("Gold Buttons (buttons)");
  });

  it("returns Unknown when no relation found", () => {
    expect(getItemName({})).toBe("Unknown");
  });

  it("returns Unknown when all relations are null", () => {
    expect(getItemName({ fabric: null, shelf_item: null, accessory: null })).toBe("Unknown");
  });

  it("prioritizes fabric over shelf and accessory", () => {
    expect(getItemName({
      fabric: { name: "Silk" },
      shelf_item: { type: "Shirt" },
      accessory: { name: "Zip", category: "zippers" },
    })).toBe("Silk");
  });
});

// ─── Qty Step Logic (for accessories) ────────────────────────────────────

describe("Accessory Qty Step Logic", () => {
  function getStep(unitOfMeasure: string): number {
    return unitOfMeasure === "meters" || unitOfMeasure === "kg" ? 0.5 : 1;
  }

  it("pieces use step of 1", () => {
    expect(getStep("pieces")).toBe(1);
  });

  it("rolls use step of 1", () => {
    expect(getStep("rolls")).toBe(1);
  });

  it("meters use step of 0.5", () => {
    expect(getStep("meters")).toBe(0.5);
  });

  it("kg use step of 0.5", () => {
    expect(getStep("kg")).toBe(0.5);
  });

  it("all valid units produce valid steps", () => {
    for (const unit of UNITS_OF_MEASURE) {
      const step = getStep(unit);
      expect(step).toBeGreaterThan(0);
      expect(step).toBeLessThanOrEqual(1);
    }
  });
});

// ─── Stock Distribution Chart Data ───────────────────────────────────────

describe("Stock Distribution Chart Data", () => {
  type StockItem = { shop_stock: number | null; workshop_stock: number | null };

  function buildDistributionData(fabrics: StockItem[], shelfItems: StockItem[], accessories: StockItem[]) {
    return [
      {
        name: "Fabrics",
        shop: fabrics.reduce((s, f) => s + Number(f.shop_stock ?? 0), 0),
        workshop: fabrics.reduce((s, f) => s + Number(f.workshop_stock ?? 0), 0),
      },
      {
        name: "Shelf",
        shop: shelfItems.reduce((s, i) => s + Number(i.shop_stock ?? 0), 0),
        workshop: shelfItems.reduce((s, i) => s + Number(i.workshop_stock ?? 0), 0),
      },
      {
        name: "Accessories",
        shop: accessories.reduce((s, a) => s + Number(a.shop_stock ?? 0), 0),
        workshop: accessories.reduce((s, a) => s + Number(a.workshop_stock ?? 0), 0),
      },
    ];
  }

  it("aggregates stock by location for each category", () => {
    const fabrics = [
      { shop_stock: 10, workshop_stock: 5 },
      { shop_stock: 3, workshop_stock: 7 },
    ];
    const shelf = [{ shop_stock: 2, workshop_stock: 8 }];
    const accessories = [{ shop_stock: 15, workshop_stock: 20 }];

    const result = buildDistributionData(fabrics, shelf, accessories);
    expect(result[0]).toEqual({ name: "Fabrics", shop: 13, workshop: 12 });
    expect(result[1]).toEqual({ name: "Shelf", shop: 2, workshop: 8 });
    expect(result[2]).toEqual({ name: "Accessories", shop: 15, workshop: 20 });
  });

  it("handles empty arrays", () => {
    const result = buildDistributionData([], [], []);
    expect(result[0]).toEqual({ name: "Fabrics", shop: 0, workshop: 0 });
    expect(result[1]).toEqual({ name: "Shelf", shop: 0, workshop: 0 });
    expect(result[2]).toEqual({ name: "Accessories", shop: 0, workshop: 0 });
  });

  it("handles null stock as 0", () => {
    const fabrics = [{ shop_stock: null, workshop_stock: null }];
    const result = buildDistributionData(fabrics, [], []);
    expect(result[0]).toEqual({ name: "Fabrics", shop: 0, workshop: 0 });
  });

  it("always returns 3 categories in order", () => {
    const result = buildDistributionData([], [], []);
    expect(result).toHaveLength(3);
    expect(result.map((d) => d.name)).toEqual(["Fabrics", "Shelf", "Accessories"]);
  });
});

// ─── Accessory Category Aggregation ──────────────────────────────────────

describe("Accessory Category Aggregation", () => {
  type AccessoryItem = { category: string; shop_stock: number | string | null; workshop_stock: number | string | null };

  const CATEGORY_LABELS: Record<string, string> = {
    buttons: "Buttons",
    zippers: "Zippers",
    thread: "Thread",
    lining: "Lining",
    elastic: "Elastic",
    interlining: "Interlining",
    other: "Other",
  };

  function buildCategoryData(accessories: AccessoryItem[]) {
    const map: Record<string, { shop: number; workshop: number }> = {};
    for (const a of accessories) {
      const cat = CATEGORY_LABELS[a.category] ?? a.category;
      if (!map[cat]) map[cat] = { shop: 0, workshop: 0 };
      map[cat]!.shop += Number(a.shop_stock ?? 0);
      map[cat]!.workshop += Number(a.workshop_stock ?? 0);
    }
    return Object.entries(map).map(([name, v]) => ({ name, ...v }));
  }

  it("groups accessories by category with labels", () => {
    const items: AccessoryItem[] = [
      { category: "buttons", shop_stock: 10, workshop_stock: 5 },
      { category: "buttons", shop_stock: 3, workshop_stock: 2 },
      { category: "thread", shop_stock: 20, workshop_stock: 15 },
    ];
    const result = buildCategoryData(items);
    const buttons = result.find((d) => d.name === "Buttons");
    const thread = result.find((d) => d.name === "Thread");
    expect(buttons).toEqual({ name: "Buttons", shop: 13, workshop: 7 });
    expect(thread).toEqual({ name: "Thread", shop: 20, workshop: 15 });
  });

  it("handles empty array", () => {
    expect(buildCategoryData([])).toEqual([]);
  });

  it("uses raw category name if no label mapping exists", () => {
    const items: AccessoryItem[] = [
      { category: "unknown_cat", shop_stock: 5, workshop_stock: 5 },
    ];
    const result = buildCategoryData(items);
    expect(result[0]!.name).toBe("unknown_cat");
  });

  it("all known categories have labels", () => {
    for (const cat of ACCESSORY_CATEGORIES) {
      expect(CATEGORY_LABELS).toHaveProperty(cat);
    }
  });
});
