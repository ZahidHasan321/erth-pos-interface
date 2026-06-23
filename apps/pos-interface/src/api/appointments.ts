import type { ApiResponse } from "../types/api";
import type { Appointment, NewAppointment } from "@repo/database";
import { db, isTransientNetworkError, withWriteRetry } from "@/lib/db";
import { getBrand } from "./orders";

const TABLE_NAME = "appointments";

const WRITE_RETRY_ATTEMPTS = 3;
const WRITE_RETRY_BASE_MS = 300;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const APPOINTMENT_SELECT = `
  *,
  assignee:users!assigned_to(id, name, username),
  booker:users!booked_by(id, name, username),
  customer:customers(id, name, phone, country_code, area, block, street, house_no)
`;

export type AppointmentWithRelations = Appointment & {
  assignee?: { id: string; name: string; username: string } | null;
  booker?: { id: string; name: string; username: string } | null;
  customer?: { id: number; name: string; phone: string; country_code: string | null; area: string | null; block: string | null; street: string | null; house_no: string | null } | null;
};

export const getAppointmentsByDateRange = async (
  startDate: string,
  endDate: string,
  assignedTo?: string,
): Promise<ApiResponse<AppointmentWithRelations[]>> => {
  let query = db
    .from(TABLE_NAME)
    .select(APPOINTMENT_SELECT)
    .eq("brand", getBrand())
    .gte("appointment_date", startDate)
    .lte("appointment_date", endDate)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (assignedTo) {
    query = query.eq("assigned_to", assignedTo);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching appointments:", error);
    return { status: "error", message: error.message, data: [] };
  }
  return { status: "success", data: data as AppointmentWithRelations[] };
};

/**
 * Cross-brand appointments for the ERTH shop coordination list (SPEC §5).
 * Unlike getAppointmentsByDateRange this does NOT filter on the current brand:
 * the showroom shop resolves appointments for every brand. The RLS
 * `appointments_select` policy still scopes results (shop department sees all
 * brands; everyone else only their own).
 */
export const getAllBrandsAppointmentsByDateRange = async (
  startDate: string,
  endDate: string,
  assignedTo?: string,
): Promise<ApiResponse<AppointmentWithRelations[]>> => {
  let query = db
    .from(TABLE_NAME)
    .select(APPOINTMENT_SELECT)
    .gte("appointment_date", startDate)
    .lte("appointment_date", endDate)
    .order("appointment_date", { ascending: true })
    .order("start_time", { ascending: true });

  if (assignedTo) {
    query = query.eq("assigned_to", assignedTo);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching appointments:", error);
    return { status: "error", message: error.message, data: [] };
  }
  return { status: "success", data: data as AppointmentWithRelations[] };
};

export const getAppointmentById = async (
  id: string,
): Promise<ApiResponse<AppointmentWithRelations>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .select(APPOINTMENT_SELECT)
    .eq("id", id)
    .eq("brand", getBrand())
    .single();

  if (error) {
    return { status: "error", message: error.message };
  }
  return { status: "success", data: data as AppointmentWithRelations };
};

export const createAppointment = async (
  appointment: Omit<NewAppointment, "id" | "created_at" | "updated_at" | "brand">,
): Promise<ApiResponse<Appointment>> => {
  const payload: NewAppointment = { ...appointment, brand: getBrand() } as NewAppointment;
  const idempotencyKey: string =
    (payload.idempotency_key as string | undefined) ?? crypto.randomUUID();
  payload.idempotency_key = idempotencyKey;

  let data: Appointment | null = null;
  for (let attempt = 1; ; attempt++) {
    const res = await db
      .from(TABLE_NAME)
      .insert(payload)
      .select()
      .single();

    if (!res.error) {
      data = res.data;
      break;
    }

    if (res.error.code === '23505') {
      const recovered = await db
        .from(TABLE_NAME)
        .select()
        .eq('idempotency_key', idempotencyKey)
        .single();
      if (!recovered.error && recovered.data) {
        data = recovered.data;
        break;
      }
    }

    if (isTransientNetworkError(res.error) && attempt < WRITE_RETRY_ATTEMPTS) {
      await sleep(WRITE_RETRY_BASE_MS * attempt);
      continue;
    }

    console.error("Error creating appointment:", res.error);
    return { status: "error", message: res.error.message };
  }

  return { status: "success", data: data as Appointment };
};

export const updateAppointment = async (
  id: string,
  updates: Partial<Appointment>,
): Promise<ApiResponse<Appointment>> => {
  const { data, error } = await withWriteRetry(
    () => db
      .from(TABLE_NAME)
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("brand", getBrand())
      .select()
      .single(),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) {
    console.error("Error updating appointment:", error);
    return { status: "error", message: error.message };
  }
  return { status: "success", data: data as Appointment };
};

/**
 * Resolve an appointment's status from the cross-brand shop list. No brand
 * filter (the row may belong to another brand); the RLS `appointments_update`
 * policy authorizes shop-department staff for every brand.
 */
export const updateAppointmentStatus = async (
  id: string,
  status: Appointment["status"],
): Promise<ApiResponse<Appointment>> => {
  const { data, error } = await withWriteRetry(
    () => db
      .from(TABLE_NAME)
      .update({ status, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select()
      .single(),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) {
    console.error("Error updating appointment status:", error);
    return { status: "error", message: error.message };
  }
  return { status: "success", data: data as Appointment };
};

export const deleteAppointment = async (
  id: string,
): Promise<ApiResponse<null>> => {
  const { error } = await withWriteRetry(
    () => db
      .from(TABLE_NAME)
      .delete()
      .eq("id", id)
      .eq("brand", getBrand()),
    (r) => isTransientNetworkError(r.error),
  );

  if (error) {
    console.error("Error deleting appointment:", error);
    return { status: "error", message: error.message };
  }
  return { status: "success", data: null };
};
