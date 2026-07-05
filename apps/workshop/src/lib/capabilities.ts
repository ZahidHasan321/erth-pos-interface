import { makeCapabilityChecker, type GrantTable } from "@repo/database";

// Workshop capability catalog.
//
// To add a NEW restriction:
//   1. add a capability string here,
//   2. deny it to the roles that shouldn't have it in GRANTS below,
//   3. gate the button/action with `useCan(CAPS.your_cap)` or `<Can cap=…>`.
//
// Route/page access still lives in the rbac.ts PERMISSIONS matrix; capabilities
// gate ACTIONS (buttons) within pages.
export const CAPS = {
  // Advance a garment's production stage (Start / Done in the terminals and the
  // garment detail page). This is the "change from one terminal to the next".
  ADVANCE_STAGE: "garment.advance_stage",
  // Submit a QC verdict (pass/fail).
  QC_SUBMIT: "garment.qc_submit",
  // Receive a garment AND immediately start production on it (the combined
  // "Receive & Start" action — plain Receive is not gated).
  RECEIVE_AND_START: "receiving.receive_and_start",
} as const;

export type Cap = (typeof CAPS)[keyof typeof CAPS];

// Per-role grants. Fixed role set (schema roleEnum).
//   "*"                → everything
//   { except: [...] }  → everything minus the listed caps
//   [ ...caps ]        → only the listed caps
//
// Supervisor = workshop manager who reschedules / reassigns work but cannot
// touch production stages: manager, minus the three production actions.
const GRANTS: GrantTable<Cap> = {
  super_admin: "*",
  admin: "*",
  manager: "*",
  supervisor: { except: [CAPS.ADVANCE_STAGE, CAPS.QC_SUBMIT, CAPS.RECEIVE_AND_START] },
  // Terminal/office workshop staff legitimately advance their own stage + QC.
  staff: [CAPS.ADVANCE_STAGE, CAPS.QC_SUBMIT, CAPS.RECEIVE_AND_START],
  // Non-workshop roles never operate the workshop floor.
  cashier: [],
  measurement_taker: [],
};

export const hasCapability = makeCapabilityChecker<Cap>(GRANTS);
