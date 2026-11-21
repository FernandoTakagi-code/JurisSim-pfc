import type { RequestHandler } from "express";
import type { AuthenticatedRequest } from "./auth-middleware";
import { administrationEnabled, institutionRegistrationEnabled } from "../config/institution-feature";
import { prisma } from "../lib/prisma";
import { localReadOnlyNavigationEnabled } from './local-read-only-navigation';

// Eventos de segurança/operação nunca contêm URLs, query strings, bodies, IPs,
// tokens, e-mails, stack traces ou mensagens arbitrárias de exceção.
export const administrationAudit: RequestHandler = (
  request: AuthenticatedRequest,
  response,
  next,
) => {
  if (administrationEnabled() || institutionRegistrationEnabled())
    response.on("finish", () => {
      const status = response.statusCode;
      let event: string | undefined;
      if (status >= 500) event = "OPERATIONAL_ERROR";
      else if (status === 401 && request.path.startsWith("/auth/"))
        event = "AUTHENTICATION_REJECTED";
      else if (status === 401 || status === 403) event = "ACCESS_DENIED";
      else if (
        status < 400 &&
        request.method !== "GET" &&
        request.path.startsWith("/auth/")
      ) {
        event =
          request.path === "/auth/register"
            ? "ACCOUNT_CREATED"
            : request.method === "DELETE"
              ? "ACCOUNT_DELETED"
              : undefined;
      }
      if (!event) return;
      if (localReadOnlyNavigationEnabled()) {
        console.info({ type: 'local_read_only_audit', event, status, actorId: request.auth?.userId });
        return;
      }
      void prisma.administrativeEvent
        .create({
          data: {
            event,
            actorId: request.auth?.userId,
            // Eventos negados não confiam em um cabeçalho de instituição enviado pelo cliente.
            institutionId: request.auth?.institutionId,
            result: status < 400 ? "SUCCESS" : "FAILED",
            severity: status >= 500 ? "ERROR" : status >= 400 ? "WARN" : "INFO",
          },
          select: { id: true },
        })
        .catch(() =>
          console.error("Não foi possível persistir evento de segurança."),
        );
    });
  next();
};
