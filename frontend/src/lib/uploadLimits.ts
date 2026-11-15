// Frontend mirror of the upload ceiling in backend/src/routes/import.ts. Kept
// duplicated rather than published as a shared package because the monorepo
// doesn't use workspaces — the same tradeoff as lib/measurements.ts.
//
// Vercel rejects a function request body over 4.5 MB with its own plain-text
// 413 before our Express app runs, so an oversized upload can never produce a
// friendly server-side error. Checking here, before the request is sent, is the
// only way the user gets a real message. Keep this in sync with MAX_FILE_SIZE.

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024; // 4MB
export const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / (1024 * 1024));

/** "4.7 MB" / "812 KB" — for telling the user how far over they are. */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
