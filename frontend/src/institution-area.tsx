import { useEffect } from "react";
import type { Session } from "./auth-session";
import { InstitutionsPortal } from "./administration";
import { IntegrationShell } from "./integration-shell";
import { EmailConfirmationGate } from "./email-confirmation-gate";
import {
  useInstitutionLocation,
  canManageInstitution,
} from "./institution-navigation";
import { InstitutionDashboard } from "./institution-dashboard";

export function InstitutionArea({
  session,
  onSair,
}: {
  session: Session;
  onSair: () => void;
}) {
  const location = useInstitutionLocation();
  const id = new URL(location, window.location.origin).searchParams.get(
    "instituicao",
  );
  const authorized = !!id && canManageInstitution(session, id);
  useEffect(() => {
    if (authorized && id)
      sessionStorage.setItem("jurissim_administration_institution", id);
  }, [authorized, id]);
  if (!session.user.emailVerificado)
    return <EmailConfirmationGate email={session.user.email} onSair={onSair} />;
  if (id && authorized)
    return (
      <InstitutionDashboard
        key={id}
        id={id}
        session={session}
        onSair={onSair}
      />
    );
  return (
    <IntegrationShell user={session.user} onSair={onSair}>
      {id ? (
        <section className="page">
          <h1>Acesso institucional não autorizado</h1>
          <p>
            Selecione uma instituição com vínculo administrativo ativo e
            confirme seu e-mail.
          </p>
        </section>
      ) : (
        <>
          <InstitutionsPortal session={session} />
        </>
      )}
    </IntegrationShell>
  );
}
