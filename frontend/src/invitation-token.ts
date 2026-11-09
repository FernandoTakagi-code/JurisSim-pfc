// Keep invitation credentials in memory, never in local/session storage or URLs
// after capture. Reopen the email link if this tab is reloaded before acceptance.
let invitationToken: string | undefined;
let confirmationProof: string | undefined;
export function captureInvitation() {
  if (!/^#\/(convite-professor|ativar-professor)\?/.test(window.location.hash)) return;
  invitationToken=undefined;
  confirmationProof=undefined;
  const params = new URLSearchParams(window.location.hash.split('?')[1]);
  const candidate = params.get('token') ?? params.get('convite');
  const proof = params.get('confirmacao');
  if(proof && /^[a-f0-9]{64}$/.test(proof)) confirmationProof = proof;
  if (candidate && /^[a-f0-9]{64}$/.test(candidate))
    invitationToken = candidate;
  window.history.replaceState({}, "", "/convite-professor");
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new Event('jurissim-invitation'));
}
captureInvitation();
window.addEventListener('hashchange',captureInvitation);
export const pendingInvitation = () => invitationToken;
export const pendingInvitationProof = () => confirmationProof;
export const clearInvitation = () => {
  invitationToken = undefined;
  confirmationProof = undefined;
};
