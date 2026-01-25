# Plan 01: Incorporate Previous Changes

## Objective
Review and merge relevant changes from `apps/Previous changes that were deleted/` into the current app.

## Background
The previous changes folder contains an attempt to use the new database types. Some of these changes broke the system. We need to identify what's useful and incorporate it properly.

## Tasks

### Task 1.1: Compare Key Files

Compare these files between current and previous:

**Routes:**
- Current: `apps/pos-interface/src/routes/$main/orders/new-work-order.tsx`
- Previous: `apps/Previous changes that were deleted/routes/$main/orders/new-work-order.tsx`

**Components:**
- Current: `apps/pos-interface/src/components/forms/`
- Previous: `apps/Previous changes that were deleted/components/forms/`

Identify:
1. What structural changes were made
2. What type changes were attempted
3. What caused the breakage

### Task 1.2: Document Differences

Create a list of:
- Files that are different
- Key changes in each file
- Which changes to keep vs discard

### Task 1.3: Selective Merge

For each difference:
1. If it's a structural improvement (component split, better organization) → Keep it
2. If it's a type change that used wrong approach → Note it, we'll fix in Plan 02
3. If it breaks functionality → Don't merge

### Task 1.4: Verify After Merge

```bash
cd apps/pos-interface
pnpm tsc --noEmit
```

Note: Errors are expected at this point. Just ensure no NEW errors from the merge.

## Key Files to Check

```
Previous changes that were deleted/
├── components/
│   └── forms/
│       ├── customer-demographics/
│       ├── order-summary-and-payment/ (vs order-type-and-payment)
│       └── ...
└── routes/
    └── $main/
        └── orders/
            └── new-work-order.tsx
```

## Completion Criteria
- [ ] Differences documented
- [ ] Useful structural changes merged
- [ ] No new breaking changes introduced
