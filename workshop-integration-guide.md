# Workshop Integration Guide

> For AI agents integrating this frontend with a Supabase/Drizzle backend.
> Scope: the full production loop from Receiving through Dispatch, plus Resource Management.
> Out of scope: CashierSystem (POS), Dashboard analytics, Stock, Prices, Admin/RBAC.

---

## 1. Architecture Overview

### 1.1 App Shell (`/App.tsx`)

Single-page app with a collapsible sidebar and centralized state. **No router** -- page switching is handled by `activePage` string state and a `renderPage()` switch statement.

**Centralized state (the two sources of truth):**
```
const [garments, setGarments] = useState<WorkshopGarment[]>(MOCK_GARMENTS);
const [resources, setResources] = useState<Resource[]>(MOCK_RESOURCES);
```

Every page/component receives `garments`, `setGarments`, and optionally `resources` / `setResources` as props. There is no context provider, no Redux -- just prop drilling from App.

**Sidebar sections relevant to the production loop:**
```
Production Management:
  Receiving           -> ReceivingOrders.tsx
  Order Parking       -> OrderParking.tsx
  Scheduler           -> Scheduler.tsx
  Assigned Orders     -> AssignedOrders.tsx
  Production Terminal -> (dropdown sub-menu)
    Soaking Terminal    -> SoakingTerminal.tsx
    Cutting Terminal    -> CuttingTerminal.tsx
    Post-Cutting Terminal -> ProductionTerminal.tsx (stage='post_cutting')
    Sewing Terminal       -> ProductionTerminal.tsx (stage='sewing')
    Finishing Terminal    -> ProductionTerminal.tsx (stage='finishing')
    Ironing Terminal      -> ProductionTerminal.tsx (stage='ironing')
    Quality Check Terminal -> QualityCheckTerminal.tsx
  Dispatch            -> Dispatch.tsx

Stock and Configuration:
  Resource Management -> ResourceManagement.tsx
```

**Badge counts** on sidebar items are derived live from the garments array:
- Receiving badge: `garments.filter(g => g.location === 'transit_to_workshop').length`
- Order Parking badge: `garments.filter(g => g.location === 'workshop' && !g.in_production && g.trip_number === 1).length`
- Scheduler badge: garments at workshop, in_production, no production_plan, at `waiting_cut`/`needs_repair`/`needs_redo`
- Assigned Orders badge: `garments.filter(g => g.location === 'workshop' && g.in_production).length`
- Dispatch badge: `garments.filter(g => g.location === 'workshop' && g.piece_stage === 'ready_for_dispatch').length`

### 1.2 Terminal routing

The `terminalStageMap` in App.tsx maps sidebar sub-item IDs to `PieceStage` values:
```
'terminal-soaking'      -> SoakingTerminal (dedicated component)
'terminal-cutting'      -> CuttingTerminal (dedicated component)
'terminal-post-cutting' -> ProductionTerminal with terminalStage='post_cutting'
'terminal-sewing'       -> ProductionTerminal with terminalStage='sewing'
'terminal-finishing'    -> ProductionTerminal with terminalStage='finishing'
'terminal-ironing'      -> ProductionTerminal with terminalStage='ironing'
'terminal-quality-check'-> QualityCheckTerminal (dedicated component)
```

`ProductionTerminal` is the generic garment-level terminal used for 4 middle stages (post-cutting, sewing, finishing, ironing). Soaking, Cutting, and QC have their own dedicated components because they have unique UX needs.

---

## 2. Type System (`/components/workshop-types.ts`)

### 2.1 Core Enums

| Type | Values | Purpose |
|------|--------|---------|
| `PieceStage` | `waiting_for_acceptance`, `waiting_cut`, `soaking`, `cutting`, `post_cutting`, `sewing`, `finishing`, `ironing`, `quality_check`, `ready_for_dispatch`, `at_shop`, `accepted`, `needs_repair`, `needs_redo`, `completed` | Garment lifecycle stage |
| `GarmentLocation` | `shop`, `workshop`, `transit_to_shop`, `transit_to_workshop` | Physical location |
| `GarmentType` | `brova` (trial garment), `final` (production garment) | Two garment types per order |
| `Brand` | `ERTH`, `SAKKBA`, `QASS` | Three brand lines |
| `FabricSource` | `IN` (workshop stock), `OUT` (customer-supplied) | Where fabric comes from |

### 2.2 WorkshopGarment (the core entity)

This is the main data object every page works with. In the real backend, this is a JOIN of the `pieces` table with `orders` and `customers`.

**Identity fields:**
- `id`: UUID primary key
- `garment_id`: Human-readable display ID like "101-1" (order 101, garment 1)
- `order_id`: FK to orders table
- `invoice_number`: Optional invoice reference

**Customer info (denormalized from order->customer):**
- `customer_name`, `customer_mobile`

**Garment details:**
- `garment_type`: 'brova' | 'final'
- `brand`: 'ERTH' | 'SAKKBA' | 'QASS'
- `fabric_source`: 'IN' | 'OUT'
- `fabric_color`, `fabric_length`, `style`
- `express`: boolean (priority flag)
- `delivery_date`: ISO date string

**State columns (the key fields that drive all filtering):**
- `piece_stage`: Current production stage (see PieceStage enum)
- `location`: Physical location (see GarmentLocation enum)
- `acceptance_status`: `null` (pending), `true` (accepted), `false` (rejected)
- `trip_number`: 1 = first time, 2+ = alteration return
- `in_production`: `false` = received but parked/waiting, `true` = actively in the production pipeline

**Workshop operational data:**
- `assigned_unit`: e.g. "Unit 1" -- which production unit
- `assigned_date`: YYYY-MM-DD -- scheduled production start date
- `assigned_person`: optional direct person assignment
- `start_time`: ISO datetime -- when work actually started at current stage
- `completion_time`: ISO datetime -- when current stage was completed
- `worker_history`: Record tracking who actually DID each step
- `production_plan`: Record tracking who is PRE-ASSIGNED to do each step

**Measurements:** Optional `Measurement` object with ~27 dishdasha measurement fields (collar, chest, sleeve, waist, pockets, provisions, jabzour).

**QC:** Optional `QualityCheckRatings` with 5 category ratings (1-5 scale).

### 2.3 WorkerHistory vs ProductionPlan

These are intentionally separate concepts:

```typescript
interface WorkerHistory {
  soaker?: string;      // Who actually soaked
  cutter?: string;      // Who actually cut
  post_cutter?: string; // etc.
  sewer?: string;
  finisher?: string;
  ironer?: string;
  quality_checker?: string;
}

interface ProductionPlan {
  soaker?: string;      // Who is ASSIGNED to soak
  cutter?: string;      // Who is ASSIGNED to cut
  post_cutter?: string;
  sewer?: string;
  sewing_unit?: string; // Unit assignment for sewing only
  finisher?: string;
  ironer?: string;
  quality_checker?: string;
}
```

- **ProductionPlan** is set by the **Scheduler** when an order is scheduled. It pre-assigns all 7 workers at once.
- **WorkerHistory** is populated by the **Production Terminals** as work is actually completed at each stage.
- These can diverge: a planned worker may not be the one who actually does the work.

### 2.4 PRODUCTION_PLAN_STEPS constant

Maps each plan key to its stage and label. Used by Scheduler (to build plans) and AssignedOrders (to display/edit plans):

```typescript
const PRODUCTION_PLAN_STEPS = [
  { key: 'soaker',          label: 'Soaking',       responsibility: 'soaking' },
  { key: 'cutter',          label: 'Cutting',       responsibility: 'cutting' },
  { key: 'post_cutter',     label: 'Post-Cutting',  responsibility: 'post_cutting' },
  { key: 'sewer',           label: 'Sewing',        responsibility: 'sewing' },
  { key: 'finisher',        label: 'Finishing',      responsibility: 'finishing' },
  { key: 'ironer',          label: 'Ironing',        responsibility: 'ironing' },
  { key: 'quality_checker', label: 'Quality Check',  responsibility: 'quality_check' },
];
```

### 2.5 WorkshopOrder (derived, not stored)

Orders are not a separate entity in the workshop state -- they are derived by grouping garments:

```typescript
interface WorkshopOrder {
  order_id: number;
  invoice_number?: number;
  customer_name: string;
  customer_mobile: string;
  delivery_date?: string;
  brands: Brand[];          // Unique brands across garments
  express: boolean;         // true if ANY garment is express
  garments: WorkshopGarment[];
}
```

The `groupGarmentsByOrder()` utility creates these from a flat garment array. Many pages group-then-render at the order level.

### 2.6 Key Helper Functions

| Function | Purpose |
|----------|---------|
| `getNextProductionStage(stage)` | Returns next stage in the pipeline (cutting->post_cutting->...->quality_check->null) |
| `getWorkerHistoryKey(stage)` | Maps terminal stage to worker_history key (e.g. 'cutting' -> 'cutter') |
| `isAlteration(garment)` | Returns true if `trip_number > 1` |
| `getAlterationLabel(tripNumber)` | Returns "1st Alt", "2nd Alt", etc. (null for trip 1) |
| `isInWorkshopProduction(garment)` | Returns true if location='workshop' AND in_production=true |
| `groupGarmentsByOrder(garments)` | Groups flat array into WorkshopOrder objects |
| `getOrderGarmentSummary(garments)` | Returns string like "1 Brova + 2 Finals" |

### 2.7 Stage Constants

- `WORKSHOP_PIPELINE`: `['soaking', 'cutting', 'post_cutting', 'sewing', 'finishing', 'ironing', 'quality_check']`
- `WORKSHOP_TERMINAL_STAGES`: `['cutting', 'post_cutting', 'sewing', 'finishing', 'ironing', 'quality_check']` (the 6 terminal-accessible stages; soaking has its own terminal)
- `QC_RETURN_STAGES`: `['cutting', 'post_cutting', 'sewing', 'finishing', 'ironing']` -- stages QC can return a garment to on failure
- `ALTERATION_REENTRY_STAGES`: `['waiting_cut', 'soaking', 'cutting', 'post_cutting', 'sewing', 'finishing']` -- valid re-entry points for alteration returns

---

## 3. Resource System (`/components/mock-data.ts` + `/components/ResourceManagement.tsx`)

### 3.1 Resource Type

```typescript
interface Resource {
  id: string;
  responsibility: 'soaking' | 'cutting' | 'post_cutting' | 'sewing' | 'finishing' | 'ironing' | 'quality_check' | '';
  resourceName: string;
  unit: string;             // 'Unit 1' through 'Unit 5'
  resourceType: 'Senior' | 'Junior' | '';
  rating: number;           // 1-5 skill rating
  dailyTarget: number;      // garments per day
  overtimeTarget: number;   // extra garments in overtime
  targetFrom: string;       // YYYY-MM-DD validity start
  targetTo: string;         // YYYY-MM-DD validity end
}
```

### 3.2 How Resources Relate to Production

- **Scheduler** uses `resources` to populate worker dropdowns for each production plan step. It groups resources by `responsibility` to show only relevant workers per step (e.g. only `responsibility='cutting'` workers for the cutter assignment).
- **Production Terminals** use `resources` to populate the worker filter dropdown at the top (filter garments by who is assigned to work them).
- **AssignedOrders** uses `resources` to populate worker dropdowns in the inline production plan editor.

Workers are identified by `resourceName` (string) throughout the system. The production plan and worker history store worker names, not IDs. This is intentional for the current mock setup but should use IDs in the real backend.

### 3.3 ResourceManagement.tsx UI

Two tabs:
1. **Skills Matrix** -- A grid showing each worker's skill ratings (1-5 or NA) across categories: Cutting, Preparation, Jabzour, Collar, Front Pocket, Other Stitching, Finishing, Ironing, Quality Check. Each row shows average rating with color coding. Editable inline.
2. **Resource Management** -- CRUD table for the `Resource[]` array. Each row has: Responsibility (dropdown), Resource Name, Unit (dropdown Unit 1-5), Type (Senior/Junior), Rating (1-5 stars), Daily Target, Overtime Target, Target From/To dates. Add/delete rows, edit inline.

The Management tab is what directly feeds the `resources` state used by Scheduler and terminals.

---

## 4. The Production Loop -- Page by Page

### 4.1 Receiving Orders (`/components/ReceivingOrders.tsx`)

**Purpose:** Accept garments arriving at the workshop from the shop.

**Tabs:**
1. **Incoming** -- Orders where garments have `location='transit_to_workshop'` and `trip_number=1`. Shows order-level cards (grouped by `groupGarmentsByOrder`).
2. **Brova Returns** -- Brova garments with `trip_number > 1` in transit or at workshop not in production. These are brova trial returns coming back.
3. **Alteration (In)** -- Final garments with `trip_number > 1` and `location='transit_to_workshop'`. These are customer-rejected finals returning for repair/redo.
4. **Alteration (Out)** -- Placeholder tab (count always 0 in current implementation).

**Key state transitions:**

| Action | Mutation |
|--------|----------|
| Receive Order | `location: 'transit_to_workshop' -> 'workshop'`, `in_production: false` (for all garments in order with trip_number=1) |
| Receive & Start | Same as above, but garments with `piece_stage != 'waiting_for_acceptance'` also get `in_production: true`. Finals with `piece_stage='waiting_for_acceptance'` (parked) stay `in_production: false`. |
| Receive Alteration | Single garment: `location -> 'workshop'`, `in_production: false` |
| Batch Receive | Calls receiveOrder for each selected order |
| Batch Receive & Start | Calls receiveAndStartOrder for each selected order |

**UI pattern:** Order cards with checkbox selection, expandable garment list, batch action bar at top when items are selected. Search filters across customer name, order ID, invoice number, garment ID.

**Key business logic:**
- When an order has both brova and final garments, the final garments start with `piece_stage='waiting_for_acceptance'` (parked). This means they can't enter production until the brova is tried by the customer and accepted.
- "Receive & Start" skips Order Parking for orders that are ready to begin production immediately.

---

### 4.2 Order Parking (`/components/OrderParking.tsx`)

**Purpose:** Holding area for received orders before they enter production. Simple routing page.

**Tabs:**
1. **Orders** -- Garments at workshop, NOT in production, trip_number=1. Grouped into orders.
2. **Returns** -- Garments at workshop, NOT in production, trip_number > 1. Split into brova returns and alteration returns.

**Key state transitions:**

| Action | Mutation |
|--------|----------|
| Send to Scheduler | For all garments in the order with `trip_number=1`, `location='workshop'`: set `in_production: true`. Garments with `piece_stage='waiting_for_acceptance'` (parked finals) are EXCLUDED -- they stay parked. |
| Send Return to Production | Single garment: set `in_production: true`, `piece_stage: <selected re-entry stage>`. The re-entry stage is chosen via a per-garment dropdown from `ALTERATION_REENTRY_STAGES`. Default is 'sewing'. |
| Batch Send to Scheduler | Calls sendToScheduler for each selected order |
| Batch Send Returns | Calls sendReturnToProduction for each selected garment with their chosen re-entry stage |

**UI pattern:** Same order card + checkbox + batch action pattern. Returns tab shows individual garment cards (not grouped) with a per-garment re-entry stage dropdown selector.

**Business logic:**
- Orders where ALL garments are `waiting_for_acceptance` (all parked) show a "Waiting for brova trial" label and cannot be sent to scheduler.
- The re-entry stage dropdown for returns uses `ALTERATION_REENTRY_STAGES` list.

---

### 4.3 Scheduler (`/components/Scheduler.tsx`)

**Purpose:** Assign a production date and full production plan (all 7 worker assignments) to orders entering production.

**What it sees:**
- Garments at `location='workshop'`, `in_production=true`, `piece_stage='waiting_cut'`, `production_plan=undefined/null` (no plan yet).
- These are orders that came from Order Parking (or Receive & Start) but haven't been scheduled yet.
- Alterations: garments at workshop, in_production, no production_plan, and `piece_stage` in `NEEDS_WORK_STAGES` (needs_repair, needs_redo).

**Tabs:**
1. **Brova** -- Schedulable orders containing at least one brova garment
2. **Final** -- Schedulable orders where all garments are finals
3. **Alteration (In)** -- Individual alteration garments needing scheduling
4. **Alteration (Out)** -- Placeholder (count 0)

**UI layout:**
- Left side: Order/garment list with checkbox selection
- Right side: Calendar (month view) for date selection. Shows scheduled garment counts per day, highlights today, Kuwait public holidays, Fridays. Past dates and holidays are non-selectable.

**Plan Dialog (the key feature):**
When user selects orders + a date and clicks "Schedule", a modal plan builder opens showing:
- All 7 production steps in order (soaking through quality_check)
- Per-step worker dropdown filtered by `resources` with matching `responsibility`
- For sewing: additional unit dropdown
- Each worker dropdown shows workload indicators (active orders/garments count)
- Alteration mode: additional re-entry stage selector, and only shows steps from re-entry stage onward

**Key state transition (submitPlan):**

For regular orders:
```
garment.production_plan = { soaker, cutter, post_cutter, sewer, sewing_unit, finisher, ironer, quality_checker }
garment.assigned_date = selectedDate
garment.assigned_unit = sewing_unit (if set)
garment.piece_stage = plan.soaker ? 'soaking' : 'cutting'  // KEY: if soaker assigned, start at soaking
```
Garments with `piece_stage='waiting_for_acceptance'` (parked finals) are EXCLUDED from scheduling.

For alterations:
```
garment.production_plan = plan (only steps from re-entry stage onward)
garment.assigned_date = selectedDate
garment.piece_stage = altReentryStage
```

**Critical logic: soaking decision.**
If a soaker worker is assigned in the production plan, the garment starts at `piece_stage='soaking'` (goes to Soaking Terminal first). If no soaker, it starts at `piece_stage='cutting'` (goes straight to Cutting Terminal). This is the branching point in the pipeline.

**Workload tracking:**
The scheduler computes per-worker and per-unit active loads by scanning all garments that have a production_plan and are still in active production stages. This is displayed as "(X orders / Y garments)" next to each worker in the dropdown.

---

### 4.4 Assigned Orders (`/components/AssignedOrders.tsx`)

**Purpose:** The management/editing hub for all orders currently in production. Order-level and per-garment inline editing.

**What it sees:**
- All garments at `location='workshop'` and `in_production=true`.
- Trip 1 garments are grouped into orders; trip>1 garments shown separately as alterations.

**Filter views:** All, Scheduled (has plan but at waiting_cut/soaking), In Production (at cutting through quality_check), Alterations (trip>1).

**Sort options:** By delivery date, assigned date, express-first, by production stage.

**Stats bar:** Total orders, Scheduled, Active, Ready for dispatch, Alterations, Express count.

**Order card structure:**
- Header: Order ID, invoice, customer name, express badge, brand badges, garment summary ("1 Brova + 2 Finals")
- Delivery date with urgency coloring (red if overdue, orange if <=2 days, yellow <=5, green otherwise)
- Current production stage (determined by the furthest-behind garment)
- Expandable garment detail list

**Per-garment detail (when expanded):**
- Garment ID, type badge, brand badge, stage badge with color
- Alteration badge if trip>1
- Inline edit button

**Inline garment editing (the production plan editor):**
When edit mode is active for a garment, shows:
- Delivery date input
- Assigned date input
- Assigned unit dropdown (Unit 1-5)
- **Full production plan editor**: All 7 steps listed vertically. Each step shows:
  - Step label (Soaking, Cutting, etc.)
  - Status: completed (green check, locked), current (blue, editable), future (gray, editable)
  - Worker dropdown filtered by `resources` with matching responsibility
  - Completed steps are locked (readonly) -- cannot change who already did the work
  - Current and future steps are editable via dropdown

**Key state transitions:**

| Action | Mutation |
|--------|----------|
| Save garment edit | Updates `delivery_date`, `assigned_date`, `assigned_unit`, `assigned_person`, and rebuilds `production_plan` from the edit form. Preserves `sewing_unit`. |
| Update order delivery date | Updates `delivery_date` on ALL garments in the order |
| Update order assigned date | Updates `assigned_date` on all trip=1 garments in the order |

**Step completion detection:**
```typescript
const STEP_TO_STAGE = {
  soaker: 1, cutter: 2, post_cutter: 3, sewer: 4,
  finisher: 5, ironer: 6, quality_checker: 7,
};
const STAGE_ORDER = {
  waiting_cut: 0, soaking: 1, cutting: 2, post_cutting: 3,
  sewing: 4, finishing: 5, ironing: 6, quality_check: 7,
  ready_for_dispatch: 8, needs_repair: 2, needs_redo: 1,
};
// A step is done if garment's stage order > step's stage order
isStepDone = STAGE_ORDER[garment.piece_stage] > STEP_TO_STAGE[stepKey]
// A step is current if equal
isStepCurrent = STAGE_ORDER[garment.piece_stage] === STEP_TO_STAGE[stepKey]
```

---

### 4.5 Soaking Terminal (`/components/SoakingTerminal.tsx`)

**Purpose:** Dedicated garment-level terminal for the soaking team. Soaking is an **optional** stage — not every garment goes through it. Whether a garment needs soaking is determined at scheduling time: if the Scheduler assigns a soaker worker, the garment starts at `piece_stage='soaking'`; if no soaker is assigned, it skips straight to `piece_stage='cutting'`. Soaking has its own team separate from the other production workers. Like all production terminals, this operates at the **garment level** — no order grouping, no expandable order cards.

**What it sees:**
- Garments at `location='workshop'`, `in_production=true`, `piece_stage='soaking'`.
- Regular garments (trip_number=1) and alteration garments (trip_number>1) are shown together in a single flat list (alterations are distinguished by their badge, not a separate section).
- Filtered by selected worker via `production_plan.soaker`.

**Tabs:**
1. **Queue** -- Garments at `piece_stage='soaking'` with no `start_time` and (`assigned_date === TODAY` or no assigned_date)
2. **Pending** -- Garments at `piece_stage='soaking'` with no `start_time` AND `assigned_date < TODAY` (overdue — should have been soaked on an earlier date)
3. **Completed** -- Garments completed today: now at `piece_stage='cutting'` with today's `completion_time` and matching `worker_history.soaker`

**Worker selector:** Dropdown of all resources with `responsibility='soaking'`. Defaults to "All Soakers".

**Stats:** Queue count, Pending count, Completed Today count.

**Garment card features:**
- Garment ID (mono font), customer name, order ID reference
- Type badge (brova/final), brand badge, express badge, alteration badge (if trip>1)
- Fabric color, fabric source (IN/OUT)
- Assigned soaker name from production plan
- Soak timer (elapsed time from start_time to now, shown when started)
- Delivery date with urgency coloring
- Quick Start/Complete buttons inline on card

**Detail view (click into a garment):**
- Garment info, fabric details, delivery date, assigned date
- Measurement diagram image + measurement grid (if measurements exist)
- Production plan pipeline visualization (same pattern as ProductionTerminal)
- Action button: Start (sets start_time) or Complete & Advance (moves to cutting)

**Key state transitions:**

| Action | Mutation |
|--------|----------|
| Start | `start_time = now` |
| Complete & Advance | `piece_stage -> 'cutting'`, `start_time = undefined`, `completion_time = now`, `worker_history.soaker = worker name`. Worker sourced from: production_plan.soaker first, then selected worker filter, then 'Unspecified'. |

---

### 4.6 Cutting Terminal (`/components/CuttingTerminal.tsx`)

**Purpose:** Dedicated garment-level terminal for cutters. Like all production terminals, operates at the **garment level** — individual garment cards, not order grouping.

**What it sees:**
- Garments at workshop, in_production, at `piece_stage='cutting'`, filtered by `production_plan.cutter`.
- Regular (trip_number=1) and alteration (trip_number>1) garments shown together in a flat list.
- Does NOT show soaking garments — those are the Soaking Terminal's responsibility. Each terminal only shows garments AT its own stage.

**Tabs:**
1. **Queue** -- Garments at `piece_stage='cutting'` with no `start_time` and (`assigned_date === TODAY` or no assigned_date)
2. **Pending** -- Garments at `piece_stage='cutting'` with no `start_time` AND `assigned_date < TODAY` (overdue)
3. **Completed** -- Garments completed today: now at `piece_stage='post_cutting'` with today's `completion_time` and matching `worker_history.cutter`

**Worker selector:** Dropdown of all resources with `responsibility='cutting'`. Defaults to "All Cutters".

**Garment card features:**
- Garment ID (mono font), customer name, order ID reference
- Type badge, brand badge, express badge, alteration badge (if trip>1)
- Fabric color, fabric length, fabric source
- Assigned cutter name from production plan
- Mini pipeline progress bar (6 or 7 colored segments — 7 if garment has a soaker in production_plan, 6 if soaking was skipped)
- Completed steps count ("X/N steps complete" where N = 6 or 7)
- Delivery date with urgency coloring
- Quick Start/Complete buttons inline on card

**Detail view (click into a garment):**
- Left column (2/3 width): Full garment info, measurements with diagram image
- Right column (1/3 width): Production plan pipeline visualization
  - Each step: icon, label, worker name
  - Green = completed, blue = current, gray = future
  - Warns if actual worker differs from planned worker
- Action button: Start (sets start_time) or Complete & Advance (moves to post_cutting)

**Measurement dialog:** Accessible via Ruler icon on garment cards. Shows measurement diagram image alongside structured grid of measurement values (same as ProductionTerminal).

**Key state transitions:**

| Action | Mutation |
|--------|----------|
| Start | `start_time = now` |
| Complete & Advance | `piece_stage -> 'post_cutting'`, `start_time = undefined`, `completion_time = now`, `worker_history.cutter = worker name`. Worker sourced from: production_plan.cutter first, then selected worker filter, then first available. |

---

### 4.7 Production Terminal (`/components/ProductionTerminal.tsx`)

**Purpose:** Generic garment-level terminal used for Post-Cutting, Sewing, Finishing, and Ironing stages. Receives `terminalStage` prop to configure which stage it operates on.

**What it sees:**
- Garments at workshop, in_production, `piece_stage === terminalStage`, trip_number=1 (regular).
- Separately: alteration garments at same stage with trip>1.
- Filtered by `production_plan[planKey] === selectedWorker` where `planKey` comes from `PRODUCTION_PLAN_STEPS`.

**Tabs:**
1. **Queue** -- Garments at `piece_stage === terminalStage` with no `start_time` and (`assigned_date === TODAY` or no assigned_date)
2. **Pending** -- Garments at `piece_stage === terminalStage` with no `start_time` AND `assigned_date < TODAY` (overdue)
3. **Completed** -- Garments completed today: now at the NEXT stage with today's `completion_time` and matching `worker_history[key]`

**Garment card features:**
- Garment ID, customer name, type/brand/express/alteration badges
- Assigned worker name from production plan
- Mini pipeline progress bar (6 or 7 colored segments: green=completed, blue=current, gray=upcoming — 7 if garment has soaker in production_plan, 6 if soaking was skipped)
- Completed steps count ("X/N steps complete" where N = 6 or 7 depending on whether soaking was part of the plan)
- Overdue indicator, start time indicator
- Quick Start/Complete buttons inline on card

**Detail view (click into a garment):**
- Left column (2/3 width): Full garment info, measurements with diagram image
- Right column (1/3 width): Full production plan pipeline visualization
  - Each step shown as a row with icon, label, and worker name
  - Green row + checkmark = completed step (shows actual worker from worker_history)
  - Blue row + play icon = current step (shows planned worker from production_plan)
  - Gray row + circle = future step (shows planned worker)
  - Warns if actual worker differs from planned worker
- Action button: Start (sets start_time) or Complete & Advance (moves to next stage)

**Alteration section:** Shown below the main grid when on Queue/Pending tabs. Each alteration garment gets its own card with start/complete actions and detail view access.

**Key state transitions:**

| Action | Mutation |
|--------|----------|
| Start | `start_time = now` |
| Complete & Advance | `piece_stage = getNextProductionStage(current)` (e.g. sewing->finishing), `start_time = undefined`, `completion_time = now`, `worker_history[key] = worker name`. Worker name sourced from: production_plan first, then selected worker, then first available worker. |

**Stage progression:** `getNextProductionStage()` maps: cutting->post_cutting->sewing->finishing->ironing->quality_check->null. Returns null at quality_check (QC terminal handles advancement to ready_for_dispatch).

---

### 4.8 Quality Check Terminal (`/components/QualityCheckTerminal.tsx`)

**Purpose:** Final quality inspection before dispatch. Has a unique rating system.

**What it sees:** Garments at `location='workshop'`, `piece_stage='quality_check'`.

**View modes:**
1. **Pending list** -- All QC garments. Split into not-started and started.
2. **Inspecting** -- Detail view for a single garment being inspected.

**Inspection UI:**
- Full garment info, measurements with diagram
- 5-category rating system (1-5 stars each):
  - Stitching Quality
  - Measurement Accuracy
  - Fabric Condition
  - Finishing Quality
  - Overall Appearance
- Pass/Fail decision

**Key state transitions:**

| Action | Mutation |
|--------|----------|
| Select for inspection | `start_time = now` |
| Pass (approve) | `piece_stage -> 'ready_for_dispatch'`, `worker_history.quality_checker = worker name`, `quality_check_ratings = ratings object` |
| Fail (return) | `piece_stage = returnStage` (selected from QC_RETURN_STAGES dropdown), `start_time = undefined`, `notes += return reason` |

**Return flow:** QC can return a garment to any of these stages: cutting, post_cutting, sewing, finishing, ironing. The garment goes back into that terminal's queue.

---

### 4.9 Dispatch (`/components/Dispatch.tsx`)

**Purpose:** Send completed garments back to the shop.

**Tabs:**
1. **Ready** -- Fully-ready orders: ALL garments in the order are `ready_for_dispatch`
2. **Partial** -- Partially-ready orders: SOME garments ready, others still in production. Shows which garments are ready vs. still in progress.
3. **In Transit** -- Already dispatched: garments with `location='transit_to_shop'`.

**Order grouping logic:**
- `readyGarments`: all garments at workshop with `piece_stage='ready_for_dispatch'`
- `fullyReadyOrders`: orders where ALL workshop in_production garments are ready_for_dispatch
- `partialOrders`: orders where NOT all garments are ready (shows remaining garments' stages)
- `inTransitOrders`: garments with `location='transit_to_shop'`

**Key state transitions:**

| Action | Level | Mutation |
|--------|-------|----------|
| Dispatch Order | Order | All `ready_for_dispatch` garments in order: `location -> 'transit_to_shop'` |
| Dispatch Garment | Garment | Single garment: `location -> 'transit_to_shop'` |
| Batch Dispatch | Multiple orders | Same as dispatch order, for all selected orders |

**UI:** Checkbox selection, expandable order cards showing garment list with stage badges, batch dispatch bar, search.

---

## 5. The Alteration Loop

Alterations are garments returning for a second (or third, etc.) trip through production.

### 5.1 How Alterations Enter

1. Customer rejects garment at shop -> garment gets `piece_stage='needs_repair'` or `'needs_redo'`, `acceptance_status=false`, `trip_number` incremented
2. Garment is sent back: `location -> 'transit_to_workshop'`
3. **Receiving** (Alt In tab): Receives the garment -> `location -> 'workshop'`, `in_production=false`
4. **Order Parking** (Returns tab): User selects a re-entry stage from ALTERATION_REENTRY_STAGES dropdown, sends to production -> `in_production=true`, `piece_stage = chosen stage`
5. **Scheduler** (Alteration In tab): Assigns production plan (only steps from re-entry onward), date, re-entry stage -> garment enters the pipeline at the chosen stage

### 5.2 How Alterations Flow Through Terminals

- All production terminals (Soaking, Cutting, Post-Cutting, Sewing, Finishing, Ironing, QC) operate at the **garment level**
- Alteration garments (`trip_number > 1`) are shown **in the same flat list** as regular garments — they are NOT separated into a dedicated section
- They are distinguished by their alteration badge (orange with RotateCcw icon) showing "1st Alt", "2nd Alt", etc.
- They use the same Queue/Pending/Completed tabs and the same Start/Complete actions as regular garments
- The worker filter applies equally to alterations (filtered by the relevant production_plan key)

### 5.3 The Brova/Final Relationship

- An order may have brova (trial) garments and final (production) garments
- Brova garments go through the full pipeline first
- Final garments start with `piece_stage='waiting_for_acceptance'` (parked)
- When the brova is dispatched to shop and customer tries it:
  - If accepted: finals can be released from parking into production
  - If rejected: brova comes back as alteration (trip 2)
- Finals with `waiting_for_acceptance` are excluded from scheduling and production plans

---

## 6. State Transition Summary

### 6.1 The Happy Path (first-trip garment)

```
POS creates order
  -> location='transit_to_workshop', piece_stage='waiting_cut', trip_number=1, in_production=false

Receiving (receive):
  -> location='workshop', in_production=false

Order Parking (send to scheduler):
  -> in_production=true

Scheduler (assign plan):
  -> production_plan={...}, assigned_date='YYYY-MM-DD'
  -> piece_stage='soaking' (if soaker assigned) OR 'cutting' (if no soaker)

Soaking Terminal (if applicable):
  -> start: start_time=now
  -> complete: piece_stage='cutting', worker_history.soaker=name, completion_time=now

Cutting Terminal:
  -> start: start_time=now
  -> complete: piece_stage='post_cutting', worker_history.cutter=name, completion_time=now

ProductionTerminal (post_cutting):
  -> piece_stage='sewing', worker_history.post_cutter=name

ProductionTerminal (sewing):
  -> piece_stage='finishing', worker_history.sewer=name

ProductionTerminal (finishing):
  -> piece_stage='ironing', worker_history.finisher=name

ProductionTerminal (ironing):
  -> piece_stage='quality_check', worker_history.ironer=name

QualityCheckTerminal:
  -> PASS: piece_stage='ready_for_dispatch', worker_history.quality_checker=name, quality_check_ratings={...}
  -> FAIL: piece_stage=<return stage>, notes+=reason

Dispatch:
  -> location='transit_to_shop'
```

### 6.2 Fields Modified at Each Stage

| Stage | Fields Set |
|-------|-----------|
| Receiving | `location`, `in_production` |
| Order Parking | `in_production`, optionally `piece_stage` (for returns) |
| Scheduler | `production_plan`, `assigned_date`, `assigned_unit`, `piece_stage` |
| Any Terminal Start | `start_time` |
| Any Terminal Complete | `piece_stage` (next), `start_time` (cleared), `completion_time`, `worker_history[key]` |
| QC Pass | `piece_stage`, `worker_history.quality_checker`, `quality_check_ratings` |
| QC Fail | `piece_stage` (return stage), `start_time` (cleared), `notes` |
| Dispatch | `location` |

---

## 7. UI Patterns and Conventions

### 7.1 Common UI Components

All pages follow consistent patterns:

- **Order cards:** White rounded-xl bordered cards with expandable garment lists. Header shows order ID (mono font), invoice number, customer name, express badge (yellow), brand badges (colored), garment summary text.
- **Garment badges:** Type badge (purple for brova, blue for final), brand badge (brand-specific color from BRAND_COLORS), express badge (yellow with Zap icon), alteration badge (orange with RotateCcw icon).
- **Checkbox selection:** CheckSquare/Square icons from lucide-react for multi-select. Batch action bar appears when selection is active.
- **Tabs:** Pill-style tabs in a gray-100 container with white active state and shadow-sm.
- **Stats cards:** Grid of white bordered cards with icon, label, count, and sub-text.
- **Search:** Input with Search icon, filters across customer name, order ID, invoice number, garment ID.
- **Worker selector:** Dropdown at top-right of terminals, defaults to "All Workers".
- **Delivery date urgency:** Red (overdue), orange (<=2 days), yellow (<=5), green (>5 days).

### 7.2 Color System

```
BRAND_COLORS:
  SAKKBA: 'bg-blue-500 text-white'
  ERTH:   'bg-purple-500 text-white'
  QASS:   'bg-indigo-500 text-white'

PIECE_STAGE_COLORS:
  waiting stages: 'bg-gray-100 text-gray-700'
  soaking:        'bg-blue-100 text-blue-700'
  production:     'bg-amber-100 text-amber-700' (cutting through quality_check)
  dispatch/shop:  'bg-green-100 text-green-700'
  needs_work:     'bg-red-100 text-red-700'
  completed:      'bg-slate-100 text-slate-700'
```

### 7.3 Measurement Dialog

Used in all production terminals (Soaking, Cutting, Post-Cutting through Ironing, and QC). Shows a dishdasha measurement diagram image (`figma:asset/374074042d2761b8459c6abd9ef864fc01f2a343.png`) alongside a structured grid of measurement values organized into sections: Collar & Shoulders, Chest & Body, Sleeves, Waist & Length, Pockets, Provisions, Jabzour. Values shown in "cm" with monospace font. Accessible via the Ruler icon on garment cards or within the garment detail view.

### 7.4 Icons

All icons from `lucide-react`. Key mappings:
- Package: receiving/empty states
- Scissors: cutting
- Droplets: soaking
- Zap: express
- RotateCcw: alteration
- Clock: queue/time
- AlertCircle: pending/overdue
- CheckCircle2: completed
- Play: start action
- Truck: dispatch
- User: worker
- Ruler: measurements
- Calendar/CalendarDays: scheduling/dates
- Edit3: edit mode
- Search: search
- ChevronDown/Up: expand/collapse
- CheckSquare/Square: selection

---

## 8. Integration Notes

### 8.1 What Needs Backend Replacement

1. **`MOCK_GARMENTS` array** -> Supabase query joining `pieces`, `orders`, `customers`, `measurements` tables
2. **`MOCK_RESOURCES` array** -> Supabase `resources` table query
3. **`setGarments(prev => prev.map(...))` pattern** -> Supabase UPDATE mutation + optimistic UI or refetch
4. **`setResources(...)` pattern** -> Supabase CRUD on resources table
5. **Derived order grouping** -> Could remain client-side (groupGarmentsByOrder utility), or add a view/RPC

### 8.2 State Mutations to Convert to API Calls

Every `setGarments(prev => prev.map(...))` call is a potential Supabase mutation. The key mutations by page:

**ReceivingOrders:** UPDATE pieces SET location='workshop', in_production=false/true WHERE order_id=X AND location='transit_to_workshop'

**OrderParking:** UPDATE pieces SET in_production=true WHERE order_id=X AND location='workshop' AND piece_stage != 'waiting_for_acceptance'

**Scheduler:** UPDATE pieces SET production_plan=jsonb, assigned_date=date, assigned_unit=text, piece_stage=enum WHERE id IN (garment_ids)

**Terminals (start):** UPDATE pieces SET start_time=now() WHERE id=X

**Terminals (complete):** UPDATE pieces SET piece_stage=next_stage, start_time=null, completion_time=now(), worker_history=jsonb WHERE id=X

**QC pass:** UPDATE pieces SET piece_stage='ready_for_dispatch', worker_history=jsonb, quality_check_ratings=jsonb WHERE id=X

**QC fail:** UPDATE pieces SET piece_stage=return_stage, start_time=null, notes=concat(notes, reason) WHERE id=X

**Dispatch:** UPDATE pieces SET location='transit_to_shop' WHERE order_id=X AND piece_stage='ready_for_dispatch'

### 8.3 Worker Identification

Currently workers are identified by `resourceName` (string) everywhere. For the real backend, this should be worker IDs (UUID FK to resources table), with name lookups for display. The production_plan and worker_history JSONB columns should store IDs, not names.

### 8.4 Real-time Considerations

Multiple workshop terminals may be in use simultaneously. Consider:
- Supabase Realtime subscriptions on the `pieces` table for live updates
- Optimistic updates with conflict resolution
- The worker filter dropdown should react to resource changes

### 8.5 Important Technical Constraint

Utility exports (types, constants, helper functions) MUST live in `.ts` files, not `.tsx` files. Putting them in `.tsx` files causes a `@react-refresh` dynamic import error in this environment. That's why `workshop-types.ts` and `mock-data.ts` are `.ts` files despite being alongside `.tsx` components.
