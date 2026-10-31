import { useSyncExternalStore } from 'react';
import { ApiError, apiRequest, onAuthorizationFailure } from './api';
export { sessionDestination } from './auth-routing';

export type Session = {
  user: { id: string; nome: string; email: string; role: 'ALUNO' | 'PROFESSOR' | 'ADMIN'; emailVerificado: boolean };
  nextStep: 'PROFESSOR' | 'DASHBOARD' | 'DIAGNOSTIC' | 'INITIAL_DIAGNOSTIC';
  localDiagnosticDemoAvailable?: boolean;
  localDiagnosticDemoActive?: boolean;
};
type State = { status: 'anonymous' | 'loading' | 'ready' | 'error'; session: Session | null; message?: string };
let state: State = { status: 'anonymous', session: null };
const listeners = new Set<() => void>();
let pending: { token: string; promise: Promise<Session> } | undefined;
let revision = 0;
const currentToken = () => sessionStorage.getItem('jurissim_token');
function update(next: State) { state = next; listeners.forEach(listener => listener()); }
const keys = ['jurissim_token', 'jurissim_next_step', 'jurissim_user_name', 'jurissim_email', 'jurissim_email_verificado', 'jurissim_local_diagnostic_demo'];
export function endSession() {
  revision++;
  pending = undefined;
  keys.forEach(key => sessionStorage.removeItem(key));
  update({ status: 'anonymous', session: null });
}
export async function logoutSession() {
  const token = currentToken();
  try { if (token) await apiRequest('/auth/logout', { method: 'POST' }, { token }); }
  catch (error) {
    if (currentToken() === token && !(error instanceof ApiError && error.status === 401)) sessionStorage.setItem('jurissim_logout_notice', 'Você saiu deste navegador. Não foi possível confirmar o encerramento das sessões no servidor.');
  } finally { if (currentToken() === token) endSession(); }
  return !currentToken(); // A delayed logout must not replace a newer login.
}
function validSession(value: Session): boolean {
  const user = value?.user;
  return Boolean(user && typeof user.id === 'string' && user.id && typeof user.nome === 'string' && typeof user.email === 'string' &&
    ['ALUNO', 'PROFESSOR', 'ADMIN'].includes(user.role) && typeof user.emailVerificado === 'boolean' &&
    (value.localDiagnosticDemoAvailable === undefined || typeof value.localDiagnosticDemoAvailable === 'boolean') &&
    (value.localDiagnosticDemoActive === undefined || typeof value.localDiagnosticDemoActive === 'boolean') &&
    ['PROFESSOR', 'DASHBOARD', 'DIAGNOSTIC', 'INITIAL_DIAGNOSTIC'].includes(value.nextStep));
}

export function refreshSession(force = false): Promise<Session> {
  const token = currentToken();
  if (!token) { endSession(); return Promise.reject(new Error('Autenticação obrigatória.')); }
  if (pending?.token === token && !force) return pending.promise;
  const requestRevision = ++revision;
  if (state.status !== 'ready') update({ status: 'loading', session: null });
  const promise = apiRequest<Session>('/auth/session', {}, { token }).then(session => {
    if (currentToken() !== token || requestRevision !== revision) throw new Error('A sessão foi substituída.');
    if (!validSession(session)) throw new Error('Não foi possível validar a sessão recebida.');
    // Compatibility cache only: authorization and rendering use the server response.
    sessionStorage.setItem('jurissim_next_step', session.nextStep);
    sessionStorage.setItem('jurissim_user_name', session.user.nome);
    sessionStorage.setItem('jurissim_email', session.user.email);
    sessionStorage.setItem('jurissim_email_verificado', String(session.user.emailVerificado));
    update({ status: 'ready', session });
    return session;
  }).catch(error => {
    if (currentToken() === token && requestRevision === revision) update({ status: 'error', session: null, message: error.message });
    throw error;
  }).finally(() => { if (pending?.promise === promise) pending = undefined; });
  pending = { token, promise };
  return promise;
}
export async function establishSession(token: string) {
  endSession();
  sessionStorage.setItem('jurissim_token', token);
  const session = await refreshSession();
  sessionStorage.removeItem('jurissim_logout_notice');
  return session;
}
export function setLocalDiagnosticDemoMode(enabled: boolean) {
  if (enabled) sessionStorage.setItem('jurissim_local_diagnostic_demo', 'true');
  else sessionStorage.removeItem('jurissim_local_diagnostic_demo');
}
onAuthorizationFailure((status, token, path) => {
  if (token !== currentToken()) return; // Ignore delayed responses from a previous login.
  if (status === 401) endSession();
  else if (path !== '/auth/session') void refreshSession().catch(() => {});
});
export function useSession() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);
}
