import type { ApiResponse } from "../types/api";
import type { Appointment, NewAppointment } from "@repo/database";
import { db } from "@/lib/db";
import { getBrand } from "./orders";

const TABLE_NAME = "appointments";

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
  return { status: "success", data: data as any };
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
  return { status: "success", data: data as any };
};

export const createAppointment = async (
  appointment: Omit<NewAppointment, "id" | "created_at" | "updated_at" | "brand">,
): Promise<ApiResponse<Appointment>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .insert({ ...appointment, brand: getBrand() })
    .select()
    .single();

  if (error) {
    console.error("Error creating appointment:", error);
    return { status: "error", message: error.message };
  }
  return { status: "success", data: data as any };
};

export const updateAppointment = async (
  id: string,
  updates: Partial<Appointment>,
): Promise<ApiResponse<Appointment>> => {
  const { data, error } = await db
    .from(TABLE_NAME)
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("brand", getBrand())
    .select()
    .single();

  if (error) {
    console.error("Error updating appointment:", error);
    return { status: "error", message: error.message };
  }
  return { status: "success", data: data as any };
};

export const deleteAppointment = async (
  id: string,
): Promise<ApiResponse<null>> => {
  const { error } = await db
    .from(TABLE_NAME)
    .delete()
    .eq("id", id)
    .eq("brand", getBrand());

  if (error) {
    console.error("Error deleting appointment:", error);
    return { status: "error", message: error.message };
  }
  return { status: "success", data: null };
};
