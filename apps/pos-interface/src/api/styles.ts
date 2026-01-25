import type { Style } from "@repo/database";
import { supabase } from "@/lib/supabase";
import type { ApiResponse } from "@/types/api";

export const getStyles = async (): Promise<ApiResponse<Style[]>> => {
  const { data, error, count } = await supabase
    .from('styles')
    .select('*', { count: 'exact' });

  if (error) {
    console.error('Error fetching styles:', error);
    return {
      status: 'error',
      message: error.message,
      data: [],
      count: 0
    };
  }

  return {
    status: 'success',
    data: data as Style[],
    count: count || 0
  };
};