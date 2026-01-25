import type { Employee } from '@repo/database';
import { supabase } from '../lib/supabase';
import type { ApiResponse } from '../types/api';

export const getEmployees = async (): Promise<ApiResponse<Employee[]>> => {
  const { data, error, count } = await supabase
    .from('users')
    .select('*', { count: 'exact' });

  if (error) {
    console.error('Error fetching employees:', error);
    return {
      status: 'error',
      message: error.message,
      data: [],
      count: 0
    };
  }

  // Cast the data to Employee[] - relying on the DB schema matching the type
  return {
    status: 'success',
    data: (data as any) as Employee[], 
    count: count || 0
  };
};
