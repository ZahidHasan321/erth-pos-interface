import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  getUsers,
  createUser,
  updateUser,
  deactivateUser,
  activateUser,
  deleteUser,
} from "@/api/users";
import type { NewUser, User } from "@repo/database";

const KEY = ["users"] as const;

export function useUsers() {
  return useQuery({
    queryKey: KEY,
    queryFn: getUsers,
    staleTime: 60_000,
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      u: Omit<NewUser, "id" | "created_at" | "updated_at"> & {
        pin?: string;
        resources?: Array<{ resource_name?: string; responsibility: string; unit_id?: string | null }>;
      },
    ) => createUser(u),
    onSuccess: (created) => {
      // Seed the list cache so the detail page (which derives the user from
      // the list) finds it immediately after navigation — without this,
      // "user not found" flashes briefly while the invalidate refetch is in flight.
      qc.setQueryData<User[]>(KEY, (old) => {
        if (!old) return [created];
        if (old.some((u) => u.id === created.id)) return old;
        return [...old, created];
      });
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Omit<NewUser, "id" | "created_at">>;
    }) => updateUser(id, updates),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

function toggleActiveInCache(qc: ReturnType<typeof useQueryClient>, id: string, isActive: boolean) {
  qc.setQueryData<User[]>(KEY, (old) =>
    old?.map((u) => (u.id === id ? { ...u, is_active: isActive } : u)),
  );
}

export function useDeactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deactivateUser(id),
    onMutate: (id) => {
      // Snapshot for rollback if the request fails.
      const prev = qc.getQueryData<User[]>(KEY);
      toggleActiveInCache(qc, id, false);
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useActivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => activateUser(id),
    onMutate: (id) => {
      const prev = qc.getQueryData<User[]>(KEY);
      toggleActiveInCache(qc, id, true);
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) qc.setQueryData(KEY, ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: (_data, id) => {
      qc.setQueryData<User[]>(KEY, (old) => old?.filter((u) => u.id !== id));
      qc.invalidateQueries({ queryKey: KEY });
    },
  });
}
