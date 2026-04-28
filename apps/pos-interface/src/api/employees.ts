import type { Employee } from '@repo/database';
import { db } from "@/lib/db";
import type { ApiResponse } from '../types/api';

// Explicit columns — `pin`, `failed_login_attempts`, `locked_until` are
// service_role-only; SELECT * would error.
const EMPLOYEE_COLUMNS =
  'id, auth_id, username, name, email, country_code, phone, role, department, job_functions, brands, is_active, employee_id, nationality, hire_date, notes, created_at, updated_at';

export const getEmployees = async (): Promise<ApiResponse<Employee[]>> => {
  const { data, error } = await db
    .from('users')
    .select(EMPLOYEE_COLUMNS);

  if (error) {
    console.error('Error fetching employees:', error);
    return {
      status: 'error',
      message: error.message,
      data: [],
    };
  }

  return {
    status: 'success',
    data: (data as any) as Employee[],
  };
};
