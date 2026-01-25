# Plan: Fix new-work-order.tsx and Subcomponents

## Overview

The `new-work-order.tsx` page broke when migrating from the old camelCase/PascalCase data model (with separate `fabricSelections` + `styleOptions` arrays) to the new snake_case unified model (single `garments` array). This plan outlines all the issues and the fixes needed.

---

## Key Differences Between Old and New Architecture

| Aspect | Old (Working) | New (Current/Broken) |
|--------|---------------|----------------------|
| Form structure | `fabricSelections[]` + `styleOptions[]` | `garments[]` (unified) |
| Address fields | Nested `address: { city, area, ... }` | Flat: `city, area, ...` directly on customer |
| Measurement date field | Mixed (`measurementDate` vs `measurement_date`) | Should be `measurement_date` (snake_case) |
| Date handling | `dob: new Date(customer.dob)` | `dob: customer.dob.toISOString()` |
| Notes field in demographics | `note` | `notes` |
| Database types | Airtable wrapper types | Drizzle-inferred snake_case types |

---

## Issues to Fix

### Issue 1: `resetLocalState()` Uses Old Form Structure

**File:** `new-work-order.tsx:698-702`

**Problem:**
```typescript
fabricSelectionForm.reset({
    fabricSelections: [],  // OLD structure
    styleOptions: [],      // OLD structure
    signature: "",
});
```

**Fix:**
```typescript
fabricSelectionForm.reset({
    garments: [],
    signature: "",
});
```

---

### Issue 2: `measurementsForm` Default Uses Wrong Field Name AND Type

**File:** `new-work-order.tsx:181-185`

**Problem:**
```typescript
defaultValues: {
    ...customerMeasurementsDefaults,
    measurementDate: new Date(),  // Wrong: camelCase AND wrong type (should be string)
},
```

The schema uses `measurement_date` (snake_case) and it's a **string** type (ISO date string), but the component uses `measurementDate` with a `Date` object.

**Verified schema** (`customer-measurements/schema.ts:10`):
```typescript
measurement_date: z.string().optional().nullable(),
```

**Verified defaults** (`customer-measurements/schema.ts:65`):
```typescript
measurement_date: new Date().toISOString(),
```

**Fix:**
```typescript
defaultValues: {
    ...customerMeasurementsDefaults,
    measurement_date: new Date().toISOString(),
},
```

**Also affects lines:**
- Line 183: Initial form setup - use `measurement_date: new Date().toISOString()`
- Line 311: `handlePendingOrderSelected` - use `measurement_date: new Date().toISOString()`
- Line 668-671: useEffect reset - use `measurement_date: new Date().toISOString()`
- Line 694-696: `resetLocalState` - use `measurement_date: new Date().toISOString()`

---

### Issue 3: `customerAddress` Prop References Non-Existent `address` Field

**File:** `new-work-order.tsx:1039`

**Problem:**
```typescript
customerAddress={customerDemographics?.address}  // .address doesn't exist!
```

The current `customerDemographics` schema has flat address fields, not a nested `address` object.

**Verified `OrderSummaryAndPaymentForm` expected prop type** (`order-summary-and-payment-form.tsx:89-96`):
```typescript
customerAddress?: {
    city?: string;
    area?: string;
    block?: string;
    street?: string;
    house_no?: string;
    address_note?: string;
};
```

**Fix:** Construct the address object from flat fields:
```typescript
customerAddress={{
    city: customerDemographics?.city,
    area: customerDemographics?.area,
    block: customerDemographics?.block,
    street: customerDemographics?.street,
    house_no: customerDemographics?.house_no,
    address_note: customerDemographics?.address_note,
}}
```

---

### Issue 4: `mapCustomerToFormValues` Has Inconsistencies

**File:** `new-work-order.tsx:79-106`

**Problems:**
1. `dob` handling: current uses `customer.dob.toISOString()` but schema expects string directly
2. The schema in `customer-demographics/schema.ts` has `notes` field but the schema default shows this is correct

**Current:**
```typescript
dob: customer.dob ? customer.dob.toISOString() : undefined,
```

**Expected (aligns with schema):** The schema `dob` is `z.string().optional()`, so `.toISOString()` is correct for a Date object from DB. However, the Drizzle `Customer` type has `dob: Date | null` so this is fine.

**Verification needed:** Ensure the CustomerDemographicsSchema's `dob` field type matches this expectation.

---

### Issue 5: `handlePendingOrderSelected` Uses Outdated Garment Mapping

**File:** `new-work-order.tsx:417-452`

**Current (correct for new structure):**
```typescript
const mappedGarments: GarmentSchema[] = orderData.garments.map((g: any) => {
    return {
        id: g.id,
        garment_id: g.garment_id,
        order_id: g.order_id,
        fabric_id: g.fabric_id,
        // ... flattened fields
    };
});
```

This is already updated for the new structure. **No fix needed here.**

---

### Issue 6: `handleOrderConfirmation` Type Mismatch

**File:** `new-work-order.tsx:631-633`

**Problem:**
```typescript
const fabricItems = fabricSelectionForm.getValues().garments
    .filter(g => g.fabric_id && g.fabric_length && g.fabric_source === 'IN')
    .map(g => ({ id: g.fabric_id!, length: parseFloat(g.fabric_length!) }));
```

The `GarmentSchema` has `fabric_id: number | null | undefined`, but the old code treated it as string and called `parseInt()`. Current code just uses `g.fabric_id!` which is correct for numbers.

**Verification needed:** Ensure `fabric_id` in the schema is actually a number, not a string.

---

### Issue 7: Shelved Products Schema Field Name

**File:** `new-work-order.tsx:224-228`

**Problem:**
```typescript
const totalShelveAmount =
    products?.reduce(
        (acc, p) => acc + (p.quantity ?? 0) * (p.unitPrice ?? 0),  // unitPrice is camelCase!
        0,
    ) ?? 0;
```

**Verified schema** (`shelved-products/schema.ts:10`):
```typescript
unit_price: z.number(),
```

The schema uses `unit_price` (snake_case).

**Fix:**
```typescript
const totalShelveAmount =
    products?.reduce(
        (acc, p) => acc + (p.quantity ?? 0) * (p.unit_price ?? 0),
        0,
    ) ?? 0;
```

---

### Issue 8: Store Schema Mismatch

**File:** `store/current-work-order.ts`

**Problem:** The store might still reference `styleOptions` separately when the new unified `garments` array includes all style options.

**Verification needed:** Check if the store's `fabricSelections` and `styleOptions` arrays are still used separately or if they should be merged into a single `garments` array.

From the exploration, the store has:
- `fabricSelections: FabricSelection[]`
- `styleOptions: StyleOption[]`

But the `FabricSelectionForm` now works with a unified `garments` array that includes both fabric and style data.

**Decision:** Keep the store structure for now but ensure proper mapping when setting/getting from store. The store acts as intermediate state.

---

### Issue 9: Dead Code in `fabric-selection-form.tsx`

**File:** `fabric-selection-form.tsx:55-87`

**Problem:**
```typescript
function mapFormGarmentToApiGarment(
    fabricSelection: FabricSelectionSchema,  // Uses old type
    styleOptions: StyleOptionsSchema,        // Uses old type
    orderId: string | number
): Partial<Garment> { ... }
```

This function references old types but is never called. **Should be removed or updated.**

---

### Issue 10: CRITICAL - Many Missing Imports in `fabric-selection-form.tsx`

**File:** `fabric-selection-form.tsx`

**Problem:** The file is missing MANY required imports. This file will NOT compile.

**Current imports:**
```typescript
import { getFabrics } from "@/api/fabrics";
import { createGarment, updateGarment } from "@/api/garments";
import { getMeasurementsByCustomerId } from "@/api/measurements";
import { getStyles } from "@/api/styles";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "@tanstack/react-query";
import * as React from "react";
import { useReactToPrint } from "react-to-print";
import { FormProvider, type UseFormReturn, useFieldArray, Controller } from "react-hook-form";
import { toast } from "sonner";
import { DataTable } from "./data-table";
import { columns as fabricSelectionColumns } from "./fabric-selection/fabric-selection-columns";
import { type GarmentSchema, garmentDefaults } from "./fabric-selection/fabric-selection-schema";
```

**Missing imports that need to be added:**

1. **API Functions:**
   - `getCampaigns` from `@/api/campaigns` (used on line 364)

2. **Utility Functions:**
   - `getFabricValue` from `@/lib/utils/fabric-utils` or similar (used on line 407)
   - `cn` from `@/lib/utils`

3. **UI Components:**
   - `Alert`, `AlertDescription`, `AlertTitle` from `@/components/ui/alert`
   - `Input` from `@/components/ui/input`
   - `Label` from `@/components/ui/label`
   - `Checkbox` from `@/components/ui/checkbox`
   - `Select`, `SelectContent`, `SelectItem`, `SelectTrigger`, `SelectValue` from `@/components/ui/select`
   - `DatePicker` from `@/components/ui/date-picker`
   - `SignaturePad` from `@/components/ui/signature-pad` (or similar)

4. **Custom Components:**
   - `FabricLabel` from `./fabric-selection/fabric-print-component` (or similar)
   - `columns as styleOptionsColumns` from `./style-options/style-options-columns`

5. **Lucide Icons:**
   - `AlertCircle`, `XCircle`, `Package`, `DollarSign`, `Sparkles`, `Loader2`, `Plus`, `Copy`, `Save`, `Pencil`, `X`, `Printer`, `ArrowRight` from `lucide-react`

6. **Dead Code Types (if keeping the function):**
   - `FabricSelectionSchema` (aliased from `GarmentSchema`)
   - `StyleOptionsSchema` from `./style-options/style-options-schema`
   - `Garment` from `@repo/database`

**Fix:** Add all missing imports to the top of the file.

---

## Implementation Order

### Phase 0: Fix Compilation Blockers in Subcomponents

1. **CRITICAL: Add missing imports to `fabric-selection-form.tsx`** (Issue 10)
   - This must be done first or the app won't compile
   - Add all UI component imports, API function imports, utility imports, and icon imports
2. **Remove or fix dead code in `fabric-selection-form.tsx`** (Issue 9)

### Phase 1: Fix Critical Issues in `new-work-order.tsx`

3. **Fix `resetLocalState()` form structure** (Issue 1)
4. **Fix `measurementsForm` field name and type** (Issue 2) - all occurrences:
   - Line 183: Initial form setup
   - Line 311: `handlePendingOrderSelected`
   - Line 668-671: useEffect reset
   - Line 694-696: `resetLocalState`
5. **Fix shelved products `unit_price` field name** (Issue 7)

### Phase 2: Fix Data Flow Issues

6. **Fix `customerAddress` prop handling** (Issue 3)
   - Construct an address object from flat `customerDemographics` fields

### Phase 3: Verification & Cleanup

7. **Verify `dob` handling is correct** (Issue 4)
8. **Verify `fabric_id` type handling** (Issue 6)
9. **Verify store usage** (Issue 8)

---

## Files to Modify

| Priority | File | Changes |
|----------|------|---------|
| **P0** | `fabric-selection-form.tsx` | Add ~20 missing imports (Issue 10), remove dead code (Issue 9) |
| **P1** | `new-work-order.tsx` | Issues 1, 2, 3, 7 |
| **P2** | `order-summary-and-payment-form.tsx` | No changes needed - already accepts address object |
| **-** | `customer-measurements/schema.ts` | Verified: uses `measurement_date` (snake_case, string type) |
| **-** | `shelved-products/schema.ts` | Verified: uses `unit_price` (snake_case, number type) |

---

## Testing Checklist

After implementing fixes:

- [ ] Page loads without TypeScript errors
- [ ] Can search for a customer
- [ ] Can fill demographics and proceed
- [ ] Measurements form resets correctly when customer changes
- [ ] Can add fabric selections (garments)
- [ ] Fabric selections save correctly
- [ ] Shelved products total calculates correctly
- [ ] Order summary displays correct address
- [ ] Order confirmation works
- [ ] Navigation guard dialog works when leaving page

---

## Notes

### On snake_case Convention

The codebase is migrating to snake_case everywhere (including Zod schemas and form fields) to match the database schema from Drizzle. This is a valid approach that:

**Pros:**
- No mapping needed between form ↔ API ↔ Database
- Consistency across the stack
- Reduces bugs from case transformation

**Cons:**
- Non-standard for JavaScript/TypeScript (camelCase is convention)
- May conflict with some libraries that expect camelCase
- IDE autocomplete may suggest camelCase variants

**Recommendation:** Continue with snake_case but ensure all schemas, types, and components are consistent. The current issues stem from incomplete migration.
