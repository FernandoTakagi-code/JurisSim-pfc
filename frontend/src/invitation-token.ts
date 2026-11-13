// Keep invitation credentials in memory, never in local/session storage or URLs
// after capture. Reopen the email link if this tab is reloaded before acceptance.
let invitationToken: string | undefined;
let confirmationProof: string | undefined;
let capturedAt=0;
let invalid=false;
const MAX_CONTEXT_MS=48*60*60*1000;
export function captureInvitation() {
  if (!/^#\/(convite-professor|ativar-professor)\?/.test(window.location.hash)) return;
  invitationToken=undefined;
  confirmationProof=undefined;
  invalid=false;
  const params = new URLSearchParams(window.location.hash.split('?')[1]);
  const candidate = params.get('token') ?? params.get('convite');
  const proof = params.get('confirmacao');
  if(candidate&&/^[a-f0-9]{64}$/.test(candidate)&&(!proof||/^[a-f0-9]{64}$/.test(proof))){invitationToken=candidate;confirmationProof=proof??undefined;capturedAt=Date.now();}
  else invalid=true;
  window.history.replaceState({}, "", "/convite-professor");
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new Event('jurissim-invitation'));
}
captureInvitation();
window.addEventListener('hashchange',captureInvitation);
export const invitationContextState=()=>invalid?'invalid':!invitationToken?'missing':Date.now()-capturedAt>=MAX_CONTEXT_MS?'expired':'captured';
export const pendingInvitation = () => invitationContextState()==='captured'?invitationToken:undefined;
export const pendingInvitationProof = () => pendingInvitation()?confirmationProof:undefined;
export const clearInvitationProof=()=>{confirmationProof=undefined;};
export const clearInvitation = () => {
  invitationToken = undefined;
  confirmationProof = undefined;
  capturedAt=0;invalid=false;
};
