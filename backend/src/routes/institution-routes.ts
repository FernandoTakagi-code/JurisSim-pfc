import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireLimitedAuth,
  type AuthenticatedRequest,
} from "../middlewares/auth-middleware";
import { institutionsEnabled } from "../config/institution-feature";
import { InstitutionService } from "../services/institution-service";
import { ApiError } from "../errors/api-error";

export const institutionRoutes = Router();
const service = new InstitutionService();
const page = z.coerce.number().int().min(1).max(10000).default(1);
const id = (req: AuthenticatedRequest, key = "id") =>
  z.string().uuid().parse(req.params[key]);
export const institutionInput = z
  .object({
    name: z.string().trim().min(2).max(180),
    responsibleName: z.string().trim().min(2).max(120),
    registrationNumber: z
      .string()
      .trim()
      .transform((v) => v.replace(/[.\/\-\s]/g, "").toUpperCase())
      .refine(
        (v) => /^[A-Z0-9]{12}[0-9]{2}$/.test(v),
        "CNPJ deve ter 14 posições, com dois dígitos finais.",
      )
      .optional(),
    phone: z
      .string()
      .trim()
      .min(8)
      .max(25)
      .regex(/^\+?[\d ()-]+$/),
    description: z.string().trim().min(10).max(2000),
  })
  .strict();
export const logFilters = z
  .object({
    page,
    institutionId: z.string().uuid().optional(),
    event: z
      .string()
      .regex(/^[A-Z_]{2,80}$/)
      .optional(),
    actorId: z.string().uuid().optional(),
    severity: z.enum(["INFO", "WARN", "ERROR"]).optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .refine(
    (v) => !v.from || !v.to || Date.parse(v.from) <= Date.parse(v.to),
    "Período inválido.",
  );
institutionRoutes.get("/availability", (_req, res) => {
  res.json({ enabled: institutionsEnabled() });
});
institutionRoutes.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  if (!institutionsEnabled())
    return next(
      new ApiError(
        503,
        "Módulo institucional aguarda ativação após aplicação autorizada da migration.",
      ),
    );
  next();
});
institutionRoutes.post(
  "/requests",
  requireLimitedAuth,
  async (req: AuthenticatedRequest, res) => {
    res
      .status(201)
      .json(await service.request(req.auth!, institutionInput.parse(req.body)));
  },
);
institutionRoutes.get(
  "/mine",
  requireLimitedAuth,
  async (req: AuthenticatedRequest, res) => {
    res.json(await service.myInstitutions(req.auth!));
  },
);
institutionRoutes.use(requireAuth);
institutionRoutes.get(
  "/notifications",
  async (req: AuthenticatedRequest, res) => {
    res.json(
      await service.notifications(
        req.auth!,
        z.object({ page }).strict().parse(req.query).page,
      ),
    );
  },
);
institutionRoutes.post(
  "/invitations/accept",
  async (req: AuthenticatedRequest, res) => {
    res.json(
      await service.accept(
        req.auth!,
        z
          .object({ token: z.string().regex(/^[a-f0-9]{64}$/) })
          .strict()
          .parse(req.body).token,
      ),
    );
  },
);
institutionRoutes.get(
  "/admin/summary",
  async (req: AuthenticatedRequest, res) => {
    res.json(await service.summary(req.auth!));
  },
);
institutionRoutes.get(
  "/admin/classes",
  async (req: AuthenticatedRequest, res) => {
    res.json(
      await service.unassignedClasses(
        req.auth!,
        z.object({ page }).strict().parse(req.query).page,
      ),
    );
  },
);
institutionRoutes.patch(
  "/admin/classes/:id",
  async (req: AuthenticatedRequest, res) => {
    const { institutionId } = z
      .object({ institutionId: z.string().uuid() })
      .strict()
      .parse(req.body);
    res.json(await service.adoptClass(req.auth!, id(req), institutionId));
  },
);
institutionRoutes.get(
  "/admin/institutions",
  async (req: AuthenticatedRequest, res) => {
    const filters = z
      .object({
        page,
        status: z
          .enum(["EMAIL_PENDING", "PENDING", "ACTIVE", "REJECTED", "SUSPENDED"])
          .optional(),
      })
      .strict()
      .parse(req.query);
    res.json(
      await service.institutions(req.auth!, filters.page, filters.status),
    );
  },
);
institutionRoutes.patch(
  "/admin/institutions/:id",
  async (req: AuthenticatedRequest, res) => {
    const { status, reason } = z
      .object({
        status: z.enum(["ACTIVE", "REJECTED", "SUSPENDED"]),
        reason: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(req.body);
    res.json(await service.decide(req.auth!, id(req), status, reason));
  },
);
institutionRoutes.get(
  "/admin/users",
  async (req: AuthenticatedRequest, res) => {
    const {
      page: p,
      search,
      role,
    } = z
      .object({
        page,
        search: z.string().trim().max(120).optional(),
        role: z.enum(["ALUNO", "PROFESSOR", "ADMIN"]).optional(),
      })
      .strict()
      .parse(req.query);
    res.json(await service.users(req.auth!, p, search, role));
  },
);
institutionRoutes.patch(
  "/admin/users/:id",
  async (req: AuthenticatedRequest, res) => {
    const input = z
      .object({
        suspended: z.boolean().optional(),
        globalAdmin: z.boolean().optional(),
      })
      .strict()
      .refine(
        (v) => Object.values(v).length === 1,
        "Altere uma permissão por vez.",
      )
      .parse(req.body);
    res.json(await service.controlUser(req.auth!, id(req), input));
  },
);
institutionRoutes.get("/admin/logs", async (req: AuthenticatedRequest, res) => {
  res.json(await service.logs(req.auth!, logFilters.parse(req.query)));
});
institutionRoutes.get(
  "/:id/summary",
  async (req: AuthenticatedRequest, res) => {
    res.json(
      await service.institutionSummary(
        req.auth!,
        id(req),
        z.object({ page }).strict().parse(req.query).page,
      ),
    );
  },
);
institutionRoutes.patch("/:id", async (req: AuthenticatedRequest, res) => {
  res.json(
    await service.update(
      req.auth!,
      id(req),
      institutionInput
        .pick({ name: true, phone: true, description: true })
        .parse(req.body),
    ),
  );
});
institutionRoutes.get(
  "/:id/invitations",
  async (req: AuthenticatedRequest, res) => {
    const filters = z
      .object({
        page,
        status: z
          .enum(["PENDING", "ACCEPTED", "EXPIRED", "CANCELLED"])
          .optional(),
      })
      .strict()
      .parse(req.query);
    res.json(
      await service.invitations(
        req.auth!,
        id(req),
        filters.page,
        filters.status,
      ),
    );
  },
);
institutionRoutes.post(
  "/:id/invitations",
  async (req: AuthenticatedRequest, res) => {
    res.status(201).json(
      await service.invite(
        req.auth!,
        id(req),
        z
          .object({ email: z.string().trim().email().max(254).toLowerCase() })
          .strict()
          .parse(req.body).email,
      ),
    );
  },
);
institutionRoutes.post(
  "/:id/invitations/:invitationId/resend",
  async (req: AuthenticatedRequest, res) => {
    res.json(
      await service.invite(req.auth!, id(req), "", id(req, "invitationId")),
    );
  },
);
institutionRoutes.delete(
  "/:id/invitations/:invitationId",
  async (req: AuthenticatedRequest, res) => {
    res.json(
      await service.cancelInvitation(
        req.auth!,
        id(req),
        id(req, "invitationId"),
      ),
    );
  },
);
institutionRoutes.delete(
  "/:id/teachers/:userId",
  async (req: AuthenticatedRequest, res) => {
    res.json(await service.unlink(req.auth!, id(req), id(req, "userId")));
  },
);
institutionRoutes.get("/:id/logs", async (req: AuthenticatedRequest, res) => {
  if ("institutionId" in req.query)
    throw new ApiError(422, "Use somente a instituição da rota.");
  res.json(
    await service.logs(
      req.auth!,
      logFilters.parse({ ...req.query, institutionId: id(req) }),
      true,
    ),
  );
});
