import { useQuery } from "@tanstack/react-query";
import { getPaginatedCustomers, getCustomerById } from "@/api/customers";

export function useCustomers(page: number, pageSize: number, search?: string) {
  return useQuery({
    queryKey: ["customers", page, pageSize, search],
    queryFn: async () => {
      const response = await getPaginatedCustomers(page, pageSize, search);
      if (response.status === "error") {
        throw new Error(response.message);
      }
      return response;
    },
    placeholderData: (previousData) => previousData,
  });
}

export function useCustomer(id?: number) {
  return useQuery({
    queryKey: ["customer", id],
    queryFn: async () => {
      if (!id) return null;
      const response = await getCustomerById(id);
      if (response.status === "error") {
        throw new Error(response.message);
      }
      return response.data;
    },
    enabled: !!id,
  });
}
