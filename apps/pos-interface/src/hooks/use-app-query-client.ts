import { useQueryClient } from "@tanstack/react-query";

export const useAppQueryClient = () => {
  const queryClient = useQueryClient();

  return queryClient;
};
