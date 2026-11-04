// Keep invitation credentials in memory, never in local/session storage or URLs
// after capture. Reopen the email link if this tab is reloaded before acceptance.
let invitationToken: string | undefined;
export function captureInvitation() {
  if (!window.location.hash.startsWith("#/convite-professor?")) return;
  const candidate = new URLSearchParams(window.location.hash.split("?")[1]).get(
    "token",
  );
  if (candidate && /^[a-f0-9]{64}$/.test(candidate))
    invitationToken = candidate;
  window.history.replaceState({}, "", "/convite-professor");
}
captureInvitation();
export const pendingInvitation = () => invitationToken;
export const clearInvitation = () => {
  invitationToken = undefined;
};
