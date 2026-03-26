import { db } from "@/lib/db";
import type { Resource, NewResource } from '@repo/database';

export const getResources = async (): Promise<Resource[]> => {
  const { data, error } = await db
    .from('resources')
    .select('*')
    .order('responsibility')
    .order('resource_name');
  if (error) throw new Error(error.message);
  return data ?? [];
};

export const createResource = async (resource: Omit<NewResource, 'id' | 'created_at'>): Promise<Resource> => {
  const { data, error } = await db
    .from('resources')
    .insert(resource)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const updateResource = async (id: string, updates: Partial<NewResource>): Promise<Resource> => {
  const { data, error } = await db
    .from('resources')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data;
};

export const deleteResource = async (id: string): Promise<void> => {
  const { error } = await db.from('resources').delete().eq('id', id);
  if (error) throw new Error(error.message);
};

export interface ResourceWithUser extends Resource {
  user: { id: string; name: string; email: string | null; role: string | null; department: string | null; is_active: boolean } | null;
}

export const getResourcesWithUsers = async (): Promise<ResourceWithUser[]> => {
  const { data, error } = await db
    .from('resources')
    .select('*, user:users!user_id(id, name, email, role, department, is_active)')
    .order('responsibility')
    .order('resource_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as ResourceWithUser[];
};

export const linkResourceToUser = async (resourceId: string, userId: string): Promise<void> => {
  const { error } = await db
    .from('resources')
    .update({ user_id: userId })
    .eq('id', resourceId);
  if (error) throw new Error(error.message);
};

export const unlinkResourceFromUser = async (resourceId: string): Promise<void> => {
  const { error } = await db
    .from('resources')
    .update({ user_id: null })
    .eq('id', resourceId);
  if (error) throw new Error(error.message);
};
