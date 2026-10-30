/**
 * Normalize a repo-relative source path. Returns the normalized path, or null if unsafe:
 * absolute (POSIX, Windows drive, UNC), contains backslashes, NUL, or any `..` segment.
 */
export function normalizeRepoPath(file: string): string | null {
  if (typeof file !== 'string' || file.length === 0) return null;
  if (file.includes('\\') || file.includes('\0')) return null;
  if (file.startsWith('/') || /^[a-zA-Z]:/.test(file) || /^[a-z][a-z0-9+.-]*:\/\//i.test(file)) return null;
  const segments = file.split('/').filter((s) => s !== '' && s !== '.');
  if (segments.length === 0 || segments.some((s) => s === '..')) return null;
  return segments.join('/');
}
