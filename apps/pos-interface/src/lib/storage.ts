/**
 * File storage facade.
 *
 * Every file upload/download in the app goes through this module.
 * To swap providers (Supabase Storage → S3, MinIO, Cloudflare R2, custom
 * server), replace the implementation here. The rest of the app stays
 * untouched.
 *
 * Current backend: Supabase Storage
 */

import { db } from "./db";

/** Single bucket for all uploaded media (feedback photos/voice/video/signatures + inventory images). */
const MEDIA_BUCKET = "media";

export interface UploadResult {
  /** Public or signed URL to access the file. */
  url: string;
  /** Storage path (bucket-relative) for future reference. */
  path: string;
}

/**
 * Upload a file to storage.
 *
 * @param file      The File or Blob to upload.
 * @param path      Destination path inside the bucket, e.g. "orders/123/photo.jpg".
 * @param bucket    Storage bucket name. Defaults to `feedback-media`.
 * @returns         The public URL and storage path.
 */
export async function uploadFile(
  file: File | Blob,
  path: string,
  bucket = MEDIA_BUCKET,
): Promise<UploadResult> {
  const { data, error } = await db.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: true,
  });

  if (error) {
    throw new Error(`Upload failed: ${error.message}`);
  }

  const { data: urlData } = db.storage.from(bucket).getPublicUrl(data.path);

  return {
    url: urlData.publicUrl,
    path: data.path,
  };
}

/**
 * Delete a file from storage.
 *
 * @param paths   One or more bucket-relative paths to delete.
 * @param bucket  Storage bucket name. Defaults to `feedback-media`.
 */
export async function deleteFile(
  paths: string | string[],
  bucket = MEDIA_BUCKET,
): Promise<void> {
  const arr = Array.isArray(paths) ? paths : [paths];
  const { error } = await db.storage.from(bucket).remove(arr);
  if (error) {
    throw new Error(`Delete failed: ${error.message}`);
  }
}

/**
 * Get a public URL for a stored file.
 *
 * @param path    Bucket-relative path.
 * @param bucket  Storage bucket name. Defaults to `feedback-media`.
 */
export function getPublicUrl(path: string, bucket = MEDIA_BUCKET): string {
  const { data } = db.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

// ── Convenience helpers for feedback media ──────────────────────────────────

/**
 * Build a unique storage path for feedback media.
 *
 * Pattern: `orders/{orderId}/garments/{garmentId}/{trip}/{type}-{timestamp}.{ext}`
 */
function buildFeedbackPath(
  orderId: number,
  garmentId: string,
  tripNumber: number,
  type: "photo" | "video" | "voice" | "signature",
  ext: string,
): string {
  const ts = Date.now();
  return `orders/${orderId}/garments/${garmentId}/trip-${tripNumber}/${type}-${ts}.${ext}`;
}

/** Upload a photo captured during feedback. */
export async function uploadFeedbackPhoto(
  file: File | Blob,
  orderId: number,
  garmentId: string,
  tripNumber: number,
): Promise<UploadResult> {
  const ext = file instanceof File ? (file.name.split(".").pop() || "jpg") : "jpg";
  const path = buildFeedbackPath(orderId, garmentId, tripNumber, "photo", ext);
  return uploadFile(file, path);
}

/** Upload a voice note recorded during feedback. */
export async function uploadFeedbackVoiceNote(
  blob: Blob,
  orderId: number,
  garmentId: string,
  tripNumber: number,
): Promise<UploadResult> {
  const path = buildFeedbackPath(orderId, garmentId, tripNumber, "voice", "webm");
  return uploadFile(blob, path);
}

/** Upload a video recorded during feedback. */
export async function uploadFeedbackVideo(
  file: File | Blob,
  orderId: number,
  garmentId: string,
  tripNumber: number,
): Promise<UploadResult> {
  const ext = file instanceof File ? (file.name.split(".").pop() || "mp4") : "mp4";
  const path = buildFeedbackPath(orderId, garmentId, tripNumber, "video", ext);
  return uploadFile(file, path);
}

/** Upload a customer signature (as a data URL → Blob). */
export async function uploadFeedbackSignature(
  dataUrl: string,
  orderId: number,
  garmentId: string,
  tripNumber: number,
): Promise<UploadResult> {
  // Convert data URL to Blob
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const path = buildFeedbackPath(orderId, garmentId, tripNumber, "signature", "png");
  return uploadFile(blob, path);
}

/**
 * Upload the order-level customer signature (as a data URL → Blob).
 *
 * Fixed path per order (`orders/{orderId}/signature.png`, upsert) so re-signing
 * replaces the prior image instead of accumulating files. Returns the public
 * URL stored in `orders.customer_signature_url`.
 */
export async function uploadOrderSignature(
  dataUrl: string,
  orderId: number,
): Promise<UploadResult> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return uploadFile(blob, `orders/${orderId}/signature.png`);
}

// ── Convenience helpers for inventory item images ───────────────────────────

/** Upload an inventory item image. Replaces any existing image at the same path. */
export async function uploadInventoryImage(
  file: File | Blob,
  itemType: "fabric" | "shelf" | "accessory",
  itemId: number,
): Promise<UploadResult> {
  const ext = file instanceof File ? (file.name.split(".").pop() || "jpg") : "jpg";
  const path = `inventory/${itemType}/${itemId}/image-${Date.now()}.${ext}`;
  return uploadFile(file, path);
}

/** Upload a Damage/Waste evidence photo. */
export async function uploadWastePhoto(
  file: File | Blob,
  itemType: "fabric" | "shelf" | "accessory",
  itemId: number,
): Promise<UploadResult> {
  const ext = file instanceof File ? (file.name.split(".").pop() || "jpg") : "jpg";
  const path = `waste/${itemType}/${itemId}/photo-${Date.now()}.${ext}`;
  return uploadFile(file, path);
}

/** Upload a supplier-invoice photo for a restock. */
export async function uploadRestockInvoice(
  file: File | Blob,
  itemType: "fabric" | "shelf" | "accessory",
  itemId: number,
): Promise<UploadResult> {
  const ext = file instanceof File ? (file.name.split(".").pop() || "jpg") : "jpg";
  const path = `restock/${itemType}/${itemId}/invoice-${Date.now()}.${ext}`;
  return uploadFile(file, path);
}

/** Delete an inventory image by full URL (extracts path from public URL). */
export async function deleteInventoryImageByUrl(url: string): Promise<void> {
  const marker = `/${MEDIA_BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return;
  const path = url.substring(idx + marker.length);
  await deleteFile(path);
}
