import type { Employee } from '@repo/database';
import { db } from "@/lib/db";
import type { ApiResponse } from '../types/api';

export const getEmployees = async (): Promise<ApiResponse<Employee[]>> => {
  const { data, error } = await db
    .from('users')
    .select('*');

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
