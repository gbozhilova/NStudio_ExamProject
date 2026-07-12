import { supabase } from './supabase.js';

export const BUCKETS = {
  AVATARS: 'profile-images',
  PRODUCTS: 'product-images',
  BOOKINGS: 'booking-files'
};

const ACCEPTED_TYPES = 'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip';
export { ACCEPTED_TYPES };

/**
 * Upload a file to a Supabase Storage bucket.
 * @param {string} bucket
 * @param {string} path  - storage path e.g. "userId/avatar.jpg"
 * @param {File} file
 */
export async function uploadFile(bucket, path, file) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true, cacheControl: '3600' });
  if (error) throw error;
  return data;
}

/**
 * Get the public URL for a file in a public bucket.
 */
export function getPublicUrl(bucket, path) {
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Create a signed (temporary) URL for private bucket files.
 * @param {string} bucket
 * @param {string} path
 * @param {number} expiresIn  - seconds, default 1 hour
 */
export async function getSignedUrl(bucket, path, expiresIn = 3600) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Download a file as a Blob.
 */
export async function downloadFile(bucket, path) {
  const { data, error } = await supabase.storage.from(bucket).download(path);
  if (error) throw error;
  return data; // Blob
}

/**
 * List files inside a folder prefix.
 */
export async function listFiles(bucket, folder) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(folder, { sortBy: { column: 'created_at', order: 'desc' } });
  if (error) throw error;
  return (data ?? []).filter((f) => f.name !== '.emptyFolderPlaceholder');
}

/**
 * Delete one or more files.
 * @param {string} bucket
 * @param {string[]} paths
 */
export async function removeFiles(bucket, paths) {
  const { error } = await supabase.storage.from(bucket).remove(paths);
  if (error) throw error;
}

/** Trigger a browser download for a blob */
export function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Build a storage path for a product image */
export function productImagePath(productId, fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  return `${productId}/${Date.now()}.${ext}`;
}

/** Build a storage path for a user avatar */
export function avatarPath(userId, fileName) {
  const ext = fileName.split('.').pop().toLowerCase();
  return `${userId}/avatar.${ext}`;
}

/** Build a storage path for a booking file (includes userId as first segment for RLS) */
export function bookingFilePath(userId, bookingId, fileName) {
  return `${userId}/${bookingId}/${Date.now()}-${fileName}`;
}

/** Return a human-readable file size string */
export function formatBytes(bytes) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

/** Detect if a path/name is an image */
export function isImage(name) {
  return /\.(jpe?g|png|gif|webp|svg|avif)$/i.test(name);
}
