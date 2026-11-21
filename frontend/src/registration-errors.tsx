// Cadastro repetido de uma conta que ainda aguarda a confirmação do e-mail (o link vale 30 minutos).
import { ApiError } from "./api";

export const isPendingConfirmation = (cause: unknown) =>
  cause instanceof ApiError && cause.code === "EMAIL_PENDING_CONFIRMATION";

export function PendingConfirmationNotice({ email, message, onLogin }: { email: string; message: string; onLogin: () => void }) {
  return (
    <div className="pending-confirmation-notice" role="alert">
      <p>{message}</p>
      <p className="muted">Ao entrar com <b>{email}</b>, use “Reenviar e-mail de confirmação” para receber um novo link.</p>
      <button type="button" className="outline-button" onClick={onLogin}>Entrar e reenviar o link</button>
    </div>
  );
}
