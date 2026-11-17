export function isValidAppUrl(value?: string): value is string {
  if (!value || /[\s\\<>"']/.test(value)) return false;
  if (Array.from(value).some(character => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
  })) return false;
  try {
    const url = new URL(value);
    if(process.env.NODE_ENV==='production'&&(url.hostname==='localhost'||url.hostname.endsWith('.localhost')||url.hostname.startsWith('127.')||url.hostname==='[::1]'))return false;
    return (url.protocol === 'https:' || (process.env.NODE_ENV !== 'production' && url.protocol === 'http:')) &&
      !url.username && !url.password && !url.search && !url.hash;
  } catch {
    return false;
  }
}
