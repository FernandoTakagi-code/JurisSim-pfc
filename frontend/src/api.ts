const api = import.meta.env.VITE_API_URL ?? 'http://localhost:3333';

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
type Options = { authenticated?: boolean; token?: string };
let authorizationHandler: (status: number, token: string, path: string) => void = () => {};
export function onAuthorizationFailure(handler: typeof authorizationHandler) { authorizationHandler = handler; }

export async function apiRequest<T>(path: string, init: RequestInit = {}, options: Options = {}): Promise<T> {
  const authenticated = options.authenticated !== false;
  const token = authenticated ? options.token ?? sessionStorage.getItem('jurissim_token') ?? '' : '';
  const headers: Record<string, string> = Object.fromEntries(new Headers(init.headers).entries());
  delete headers.authorization;
  if (!(init.body instanceof FormData) && !headers['content-type']) headers['Content-Type'] = 'application/json';
  if (authenticated) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try { response = await fetch(`${api}${path}`, { ...init, headers }); }
  catch { throw new Error('Não foi possível conectar ao servidor. Verifique sua conexão e tente novamente.'); }
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (authenticated && (response.status === 401 || response.status === 403)) authorizationHandler(response.status, token, path);
    const message = typeof body.message === 'string' ? body.message : typeof body.erro === 'string' ? body.erro : 'Não foi possível concluir a operação.';
    throw new ApiError(response.status, message);
  }
  return body as T;
}
