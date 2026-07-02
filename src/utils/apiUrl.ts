/**
 * Helper utility to safely construct absolute URLs from relative API or asset paths.
 * This is crucial in sandboxed iframe environments (such as the builder preview)
 * where window.location.href or window.location.origin might be 'about:blank' or 'null',
 * which causes relative fetches or relative media src to fail on browsers like Safari.
 */
export function getApiUrl(path: string): string {
  // Ensure the path starts with a single slash
  const cleanPath = path.startsWith('/') ? path : `/${path}`;

  // 1. If we are in a browser context and have a valid window.location with http/https
  if (
    typeof window !== 'undefined' &&
    window.location &&
    window.location.origin &&
    window.location.origin !== 'null' &&
    window.location.origin.startsWith('http')
  ) {
    return `${window.location.origin}${cleanPath}`;
  }

  // 2. Fallback to document.referrer if origin is 'null' or about:blank
  if (typeof document !== 'undefined' && document.referrer && document.referrer.startsWith('http')) {
    try {
      const refUrl = new URL(document.referrer);
      return `${refUrl.origin}${cleanPath}`;
    } catch (e) {
      // Ignore URL parsing errors
    }
  }

  // 3. Fallback to simple relative path
  return cleanPath;
}
