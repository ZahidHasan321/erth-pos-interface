import { db } from "@/lib/db";

/** Per quality-aspect aggregate (CLAUDE.md §6 Q2 defect-category breakdown). */
export interface QcAspectStat {
  /** Mean 1–5 rating across attempts that rated this aspect. */
  avg: number;
  /** Attempts that rated this aspect. */
  rated: number;
  /** Attempts where the aspect scored < 4 (non-conformity). */
  fails: number;
}

export interface QcTrendPoint {
  date: string;
  /** Mean of all aspect ratings recorded that day. null when none rated. */
  avg: number | null;
  attempts: number;
}

/** Shape of get_qc_analytics(from, to). Objects are keyed by aspect/field/option/stage. */
export interface QcAnalytics {
  total_attempts: number;
  pass: number;
  fail: number;
  by_aspect: Record<string, QcAspectStat>;
  measurement_defects: Record<string, number>;
  option_defects: Record<string, number>;
  stage_defects: Record<string, number>;
  trend: QcTrendPoint[];
}

const EMPTY: QcAnalytics = {
  total_attempts: 0,
  pass: 0,
  fail: 0,
  by_aspect: {},
  measurement_defects: {},
  option_defects: {},
  stage_defects: {},
  trend: [],
};

/** QC quality analytics over [from, to) (CLAUDE.md §6 Q2). Reads the 1–5 ratings
 *  and failed-key breadcrumbs stored in each garment's QC history; the pass/fail
 *  rule itself is unchanged. */
export const getQcAnalytics = async (
  from: string,
  to: string
): Promise<QcAnalytics> => {
  const { data, error } = await db.rpc("get_qc_analytics", { p_from: from, p_to: to });
  if (error) throw new Error(`getQcAnalytics: failed to fetch QC analytics between ${from} and ${to}: ${error.message}`);
  return (data ?? EMPTY) as QcAnalytics;
};
