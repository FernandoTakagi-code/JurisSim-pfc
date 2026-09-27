export type PasswordRecoveryEmail = {
  to: string;
  resetUrl: string;
  expiresInMinutes: number;
};

export interface RecoveryEmailSender {
  readonly isConfigured: boolean;
  sendPasswordRecovery(email: PasswordRecoveryEmail): Promise<void>;
}

// Intentionally has no fallback that prints or returns the recovery URL.
// A provider adapter must be selected and configured before delivery is enabled.
export class UnconfiguredRecoveryEmailSender implements RecoveryEmailSender {
  readonly isConfigured = false;

  async sendPasswordRecovery(_email: PasswordRecoveryEmail): Promise<void> {
    throw new Error('Recovery email provider is not configured.');
  }
}

export class ConsoleRecoveryEmailSender implements RecoveryEmailSender {
  readonly isConfigured = true;

  async sendPasswordRecovery({ to, resetUrl, expiresInMinutes }: PasswordRecoveryEmail): Promise<void> {
    console.log('\n===== E-MAIL DE RECUPERAÇÃO DE SENHA (SIMULADO) =====');
    console.log(`Para: ${to}`);
    console.log(`Link: ${resetUrl}`);
    console.log(`Expira em: ${expiresInMinutes} minutos`);
    console.log('======================================================\n');
  }
}
