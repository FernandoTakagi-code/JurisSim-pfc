export function isValidAppUrl(value?: string): value is string {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}
