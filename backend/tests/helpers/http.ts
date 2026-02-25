export function getCookieValue(setCookieHeader: string[] | string | undefined, cookieName: string): string | undefined {
  if (!setCookieHeader) {
    return undefined;
  }

  const entries = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  for (const entry of entries) {
    const match = entry.match(new RegExp(`^${cookieName}=([^;]*)`));
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

export function hasSetCookie(setCookieHeader: string[] | string | undefined, cookieName: string): boolean {
  if (!setCookieHeader) {
    return false;
  }

  const entries = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
  return entries.some(entry => entry.startsWith(`${cookieName}=`));
}
