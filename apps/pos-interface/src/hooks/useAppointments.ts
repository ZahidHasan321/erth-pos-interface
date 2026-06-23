import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getAppointmentsByDateRange,
  getAllBrandsAppointmentsByDateRange,
  createAppointment,
  updateAppointment,
  updateAppointmentStatus,
  deleteAppointment,
} from "@/api/appointments";
import { getEmployees } from "@/api/employees";
import type { Appointment } from "@repo/database";
import { getBrand } from "@/api/orders";
import { getLocalDateStr } from "@/lib/utils";

const APPOINTMENTS_KEY = "appointments";

export function useAppointments(
  startDate: string,
  endDate: string,
  assignedTo?: string,
) {
  return useQuery({
    queryKey: [APPOINTMENTS_KEY, startDate, endDate, assignedTo],
    queryFn: () => getAppointmentsByDateRange(startDate, endDate, assignedTo),
    select: (res) => res.data ?? [],
    staleTime: 1000 * 60 * 5,
  });
}

/** Cross-brand appointments for the ERTH shop coordination list (SPEC §5). */
export function useAllBrandsAppointments(
  startDate: string,
  endDate: string,
  assignedTo?: string,
) {
  return useQuery({
    queryKey: [APPOINTMENTS_KEY, "all-brands", startDate, endDate, assignedTo],
    queryFn: () => getAllBrandsAppointmentsByDateRange(startDate, endDate, assignedTo),
    select: (res) => res.data ?? [],
    staleTime: 1000 * 60 * 5,
  });
}

export function useTodayAppointments() {
  // "Today" is the Kuwait business day, not the viewer's browser day.
  const todayStr = getLocalDateStr();

  return useQuery({
    queryKey: [APPOINTMENTS_KEY, "today", todayStr],
    queryFn: () => getAppointmentsByDateRange(todayStr, todayStr),
    select: (res) => res.data ?? [],
    staleTime: 1000 * 60 * 5,
  });
}

export function useBrandEmployees() {
  return useQuery({
    queryKey: ["employees", "brand"],
    queryFn: getEmployees,
    select: (res) => {
      const brand = getBrand();
      return (res.data ?? []).filter(
        (e) =>
          e.is_active &&
          (!e.brands || e.brands.length === 0 || e.brands.includes(brand) || e.brands.includes(brand.toLowerCase())),
      );
    },
    staleTime: 1000 * 60 * 10,
  });
}

export function useCreateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof createAppointment>[0]) =>
      createAppointment(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] });
    },
  });
}

export function useUpdateAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<Appointment> }) =>
      updateAppointment(id, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] });
    },
  });
}

export function useUpdateAppointmentStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: Appointment["status"] }) =>
      updateAppointmentStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] });
    },
  });
}

export function useDeleteAppointment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAppointment(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [APPOINTMENTS_KEY] });
    },
  });
}
