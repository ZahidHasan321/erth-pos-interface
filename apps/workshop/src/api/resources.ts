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
