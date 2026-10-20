import path from 'node:path';
import dotenv from 'dotenv';
import { BrevoSmtpClient } from '../src/services/brevo-smtp';
import { isValidAppUrl } from '../src/services/app-url';

dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

async function main() {
  const smtp = new BrevoSmtpClient();
  console.log(`BREVO_SMTP_USER: ${process.env.BREVO_SMTP_USER?.trim() ? 'presente' : 'ausente'}`);
  console.log(`BREVO_SMTP_KEY: ${process.env.BREVO_SMTP_KEY?.trim() ? 'presente' : 'ausente'}`);
  console.log(`APP_PUBLIC_URL: ${!process.env.APP_PUBLIC_URL ? 'ausente' : isValidAppUrl(process.env.APP_PUBLIC_URL) ? 'presente' : 'aparentemente inválida'}`);
  if (!isValidAppUrl(process.env.APP_PUBLIC_URL)) process.exitCode = 1;
  if (!smtp.isConfigured) {
    console.log('SMTP: configuração ausente ou aparentemente inválida.');
    process.exitCode = 1;
    return;
  }
  if (process.argv.includes('--offline')) {
    console.log('SMTP: configuração local presente. Modo offline: nenhuma conexão ou envio; autenticação não validada.');
    return;
  }
  // verify() checks DNS, STARTTLS and authentication; it never sends a message.
  try {
    await smtp.verify();
    console.log('SMTP: conexão, STARTTLS e autenticação aprovados. Nenhum e-mail enviado.');
  } catch (error) {
    const code = (error as { code?: string }).code;
    const category = code === 'EAUTH' ? 'autenticação rejeitada' :
      code === 'ETIMEDOUT' ? 'tempo de conexão esgotado' :
      code === 'EDNS' || code === 'ESOCKET' || code === 'ECONNECTION' ? 'falha de rede ou TLS' : 'falha de conexão';
    console.log(`SMTP: ${category}. Detalhes do provedor omitidos.`);
    process.exitCode = 1;
  }
}

main().catch(() => {
  console.log('Verificação não concluída. Detalhes sensíveis omitidos.');
  process.exitCode = 1;
});
