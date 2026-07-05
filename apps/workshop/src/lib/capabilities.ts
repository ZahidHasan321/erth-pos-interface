import { makeCapabilityChecker, type GrantTable } from "@repo/database";

// Workshop capability catalog.
//
// To add a NEW restriction:
//   1. add a capability string here,
//   2. deny it to the roles that shouldn't have it in GRANTS below,
//   3. gate the button/action with `useCan(CAPS.your_cap)` or `<Can cap=…>`.
//
// Route/page access still lives in the rbac.ts PERMISSIONS matrix; capabilities
// gate ACTIONS (buttons) within pages. A supervisor can OPEN the terminals to
// monitor; these caps disable the operate-the-floor buttons.
export const CAPS = {
  // Operate a production terminal: Start a garment, click Done (advance to the
  // next stage), or Cancel a start. This is "move a garment from one stage to
  // the next" — the one thing a supervisor cannot do.
  ADVANCE_STAGE: "garment.advance_stage",
  // Submit a QC verdict (pass/fail) — also moves the garment on.
  QC_SUBMIT: "garment.qc_submit",
} as const;

export type Cap = (typeof CAPS)[keyof typeof CAPS];

// Per-role grants. Fixed role set (schema roleEnum).
//   "*"                → everything
//   { except: [...] }  → everything minus the listed caps
//   [ ...caps ]        → only the listed caps
//
// Supervisor = workshop manager who reschedules / reassigns work and can receive
// and monitor the terminals, but cannot operate a terminal (advance a stage) or
// submit a QC verdict: manager, minus those two production actions.
const GRANTS: GrantTable<Cap> = {
  super_admin: "*",
  admin: "*",
  manager: "*",
  supervisor: { except: [CAPS.ADVANCE_STAGE, CAPS.QC_SUBMIT] },
  // Terminal/office workshop staff legitimately advance their own stage + QC.
  staff: [CAPS.ADVANCE_STAGE, CAPS.QC_SUBMIT],
  // Non-workshop roles never operate the workshop floor.
  cashier: [],
  measurement_taker: [],
};

export const hasCapability = makeCapabilityChecker<Cap>(GRANTS);
