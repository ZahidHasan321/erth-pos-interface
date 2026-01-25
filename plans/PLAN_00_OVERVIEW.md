# Migration Plan Overview

## Objective
Migrate the POS interface from Airtable to Supabase using a hybrid approach:
- **Supabase-js**: For queries with RLS support
- **Drizzle ORM**: For TypeScript types (compile-time only)

## Key Simplification: snake_case Everywhere
**No conversion/mapping needed!**
- Supabase returns snake_case → use it directly
- Types, schemas, components all use snake_case
- What you get from DB is what you use

## Scope
**Only focus on:**
- `apps/pos-interface/src/routes/$main/orders/new-work-order.tsx`
- Subcomponents used in new-work-order page

## Execution Order

| Phase | File | Description |
|-------|------|-------------|
| 1 | `PLAN_01_INCORPORATE_PREVIOUS_CHANGES.md` | Merge changes from deleted folder |
| 2 | `PLAN_02_TYPES_MIGRATION.md` | Use Drizzle types directly (snake_case) |
| 3 | `PLAN_03_API_MIGRATION.md` | Update APIs to use Supabase |
| 4 | `PLAN_04_SCHEMAS_MIGRATION.md` | Update Zod schemas to snake_case |
| 5 | `PLAN_05_TSC_FIXES.md` | Fix TypeScript errors |

## Architecture

```
Supabase (snake_case)
    ↓
API Layer (returns snake_case as-is)
    ↓
Types (Drizzle inferred, snake_case)
    ↓
Schemas (Zod, snake_case)
    ↓
Components (use snake_case directly)
```

## Key Mappings

### Field Names (Airtable → Supabase)
| Airtable | Supabase |
|----------|----------|
| `OrderID` | `invoice_number` |
| `OrderStatus` | `checkout_status` |
| `FatouraStages` | `production_stage` |
| `CustomerID[0]` | `customer_id` |
| `HomeDelivery` | `home_delivery` |
| `FabricCharge` | `fabric_charge` |

### Status Values
| Airtable | Supabase |
|----------|----------|
| `"Pending"` | `"draft"` |
| `"Completed"` | `"confirmed"` |
| `"Cancelled"` | `"cancelled"` |
| `"k-net"` | `"knet"` |

### Structure Change
| Airtable | Supabase |
|----------|----------|
| `order.fields.OrderID` | `order.invoice_number` |
| `order.id` (record ID) | `order.id` (numeric) |
| `customer.fields.Name` | `customer.name` |

## Critical Rules

1. **DO NOT delete any files**
2. **DO NOT modify files outside scope**
3. **Use snake_case everywhere** - no camelCase conversion
4. **No mappers needed** - use data directly from Supabase

## Dependencies

- `packages/database` - Contains Drizzle schema (already created)
- `@supabase/supabase-js` - Needs to be added to pos-interface
