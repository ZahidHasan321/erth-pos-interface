import { db } from "./db";

const MEDIA_BUCKET = "media";

export interface UploadResult {
  url: string;
  path: string;
}

export async function uploadFile(file: File | Blob, path: string, bucket: string = MEDIA_BUCKET): Promise<UploadResult> {
  const { data, error } = await db.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });
  if (error) throw new Error(`Upload failed: ${error.message}`);
  const { data: urlData } = db.storage.from(bucket).getPublicUrl(data.path);
  return { url: urlData.publicUrl, path: data.path };
}

export async function deleteFile(paths: string | string[], bucket: string = MEDIA_BUCKET): Promise<void> {
  const arr = Array.isArray(paths) ? paths : [paths];
  const { error } = await db.storage.from(bucket).remove(arr);
  if (error) throw new Error(`Delete failed: ${error.message}`);
}

export async function uploadInventoryImage(
  file: File | Blob,
  itemType: "fabric" | "shelf" | "accessory",
  itemId: number,
): Promise<UploadResult> {
  const ext = file instanceof File ? (file.name.split(".").pop() || "jpg") : "jpg";
  const path = `inventory/${itemType}/${itemId}/image-${Date.now()}.${ext}`;
  return uploadFile(file, path);
}

export async function deleteInventoryImageByUrl(url: string): Promise<void> {
  const marker = `/${MEDIA_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.substring(idx + marker.length);
  await deleteFile(path);
}
