import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getResources, getResourcesWithUsers, createResource, updateResource, deleteResource, linkResourceToUser, unlinkResourceFromUser } from '@/api/resources';
import type { NewResource } from '@repo/database';

const KEY = ['resources'] as const;
const WITH_USERS_KEY = ['resources-with-users'] as const;

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => {
  qc.invalidateQueries({ queryKey: KEY });
  qc.invalidateQueries({ queryKey: WITH_USERS_KEY });
};

export function useResources() {
  return useQuery({
    queryKey: KEY,
    queryFn: getResources,
    staleTime: 60_000,
  });
}

export function useCreateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (r: Omit<NewResource, 'id' | 'created_at'>) => createResource(r),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useUpdateResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<NewResource> }) =>
      updateResource(id, updates),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useDeleteResource() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteResource(id),
    onSuccess: () => invalidateAll(qc),
  });
}

export function useResourcesWithUsers() {
  return useQuery({
    queryKey: WITH_USERS_KEY,
    queryFn: getResourcesWithUsers,
    staleTime: 60_000,
  });
}

export function useLinkResourceToUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ resourceId, userId }: { resourceId: string; userId: string }) =>
      linkResourceToUser(resourceId, userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: WITH_USERS_KEY });
    },
  });
}

export function useUnlinkResourceFromUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (resourceId: string) => unlinkResourceFromUser(resourceId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: WITH_USERS_KEY });
    },
  });
}
