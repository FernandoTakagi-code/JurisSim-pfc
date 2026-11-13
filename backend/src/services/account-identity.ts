import bcrypt from 'bcrypt';
import { OAuth2Client } from 'google-auth-library';
import { ApiError } from '../errors/api-error';
import { normalizeReusableEmail } from './email-reuse-policy';

export type AccountIdentityProof = { senhaAtual?: string; googleCredential?: string };
export async function confirmAccountIdentity(user: { senhaHash: string | null; email: string }, proof: AccountIdentityProof) {
  if (user.senhaHash && user.senhaHash !== '!GOOGLE_OAUTH_ACCOUNT!') {
    if (!proof.senhaAtual || !await bcrypt.compare(proof.senhaAtual, user.senhaHash)) throw new ApiError(400, 'Senha atual incorreta.');
    return;
  }
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId || !proof.googleCredential) throw new ApiError(400, 'Confirme sua identidade com o Google.');
  try {
    const payload = (await new OAuth2Client(clientId).verifyIdToken({ idToken: proof.googleCredential, audience: clientId })).getPayload();
    const now = Math.floor(Date.now() / 1000);
    if (!payload?.email || payload.email_verified !== true || normalizeReusableEmail(payload.email) !== normalizeReusableEmail(user.email) || !payload.iat || now - payload.iat > 300 || payload.iat > now + 30) throw new Error();
  } catch { throw new ApiError(401, 'Reautenticação Google inválida ou expirada.'); }
}
