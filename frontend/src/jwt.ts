function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    return JSON.parse(atob(payload.replace(/-/g, "+").replace(/_/g, "/")));
  } catch {
    return null;
  }
}

export function decodeRole(token: string): string | null {
  const role = decodePayload(token)?.role;
  return typeof role === "string" ? role : null;
}

export function decodeUserId(token: string): string | null {
  const id = decodePayload(token)?.id;
  return typeof id === "string" ? id : null;
}
