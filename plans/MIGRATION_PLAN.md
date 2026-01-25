# Airtable to Supabase Migration Plan

## Overview
Migration from Airtable to Supabase using a hybrid approach:
- **Supabase-js**: For queries with RLS support
- **Drizzle ORM**: For TypeScript types (compile-time only)

## Key Simplification
**snake_case everywhere - no conversion needed!**
- Supabase returns snake_case → use it directly in the frontend
- Types, schemas, components all use snake_case
- No mappers required

## Scope
**Only focus on:** `new-work-order` page and its subcomponents

## Plan Files

Execute in order:

| # | File | Description |
|---|------|-------------|
| 0 | [PLAN_00_OVERVIEW.md](./PLAN_00_OVERVIEW.md) | Architecture and key mappings |
| 1 | [PLAN_01_INCORPORATE_PREVIOUS_CHANGES.md](./PLAN_01_INCORPORATE_PREVIOUS_CHANGES.md) | Merge useful changes from deleted folder |
| 2 | [PLAN_02_TYPES_MIGRATION.md](./PLAN_02_TYPES_MIGRATION.md) | Use Drizzle types directly (snake_case) |
| 3 | [PLAN_03_API_MIGRATION.md](./PLAN_03_API_MIGRATION.md) | Replace Airtable APIs with Supabase |
| 4 | [PLAN_04_SCHEMAS_MIGRATION.md](./PLAN_04_SCHEMAS_MIGRATION.md) | Update Zod schemas to snake_case |
| 5 | [PLAN_05_TSC_FIXES.md](./PLAN_05_TSC_FIXES.md) | Fix TypeScript errors |

## Critical Rules

1. **DO NOT delete any files**
2. **DO NOT modify files outside scope**
3. **Use snake_case everywhere** - matches database directly
4. **No mappers** - data flows through unchanged

## Quick Reference

### Structure Change
```
Airtable:  order.fields.OrderID
Supabase:  order.invoice_number
```

### Status Values
```
Airtable:  "Pending" | "Completed" | "Cancelled"
Supabase:  "draft"   | "confirmed" | "cancelled"
```

## Previous Changes Reference
Located in: `apps/Previous changes that were deleted/`
