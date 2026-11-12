import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireLimitedAuth,
  type AuthenticatedRequest,
} from "../middlewares/auth-middleware";
import { administrativeCapabilities } from "../config/institution-feature";
import { authRateLimit } from '../middlewares/auth-rate-limit';
import { InstitutionService } from "../services/institution-service";
import { ApiError } from "../errors/api-error";
import { InvitationOnboardingService } from '../services/invitation-onboarding';

export const institutionRoutes = Router();
const service = new InstitutionService();
const onboarding = new InvitationOnboardingService();
const invitationToken = z.string().regex(/^[a-f0-9]{64}$/);
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
      .transform((v) => v.replace(/[./\-\s]/g, "").toUpperCase())
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
  res.set('Cache-Control','no-store');
  res.json(administrativeCapabilities());
});
institutionRoutes.use((_req, res, next) => {
  res.set("Cache-Control", "no-store");
  const availability = administrativeCapabilities(), caps = availability.capabilities;
  const path = _req.path;
  const allowed = path === '/requests' ? availability.registrationEnabled
    : path === '/mine' ? availability.registrationEnabled || availability.administrationEnabled
    : path === '/notifications' ? caps.notifications
    : /^\/admin\/institutions(?:\/|$)/.test(path) ? caps.institutions
    : path === '/admin/logs' ? caps.audit
    : path.startsWith('/admin/') ? availability.administrationEnabled
    : availability.enabled;
  if (!allowed)
    return next(
      new ApiError(
        503,
        "Este recurso aguarda habilitação administrativa autorizada. Operações institucionais com vínculos permanecem separadas.",
      ),
    );
  next();
});
institutionRoutes.post(
  "/requests",
  requireAuth,
  authRateLimit(15, 3600000),
  async (req: AuthenticatedRequest, res) => {
    res
      .status(201)
      .json(await service.request(req.auth!, institutionInput.extend({institutionType: z.enum(['ENSINO_SUPERIOR','CURSO_PREPARATORIO','OUTRA_ORGANIZACAO']).optional()}).parse(req.body)));
  },
);
institutionRoutes.get(
  "/mine",
  requireLimitedAuth,
  async (req: AuthenticatedRequest, res) => {
    res.json(await service.myInstitutions(req.auth!));
  },
);
institutionRoutes.post('/invitations/inspect', authRateLimit(30, 60_000), async (req, res) => {
  const {token} = z.object({token:invitationToken}).strict().parse(req.body);
  res.json(await onboarding.inspect(token));
});
institutionRoutes.post('/invitations/onboarding', authRateLimit(5, 3600_000), async (req, res) => {
  const input = z.object({token:invitationToken,nome:z.string().trim().min(2).max(120),acceptance:z.unknown()}).strict().parse(req.body);
  res.json(await onboarding.start(input.token,input.nome,input.acceptance));
});
institutionRoutes.post('/invitations/complete', authRateLimit(10, 3600_000), async (req,res) => {
  const input=z.object({token:invitationToken,proof:invitationToken,password:z.string().max(128),confirmation:z.string().max(128)}).strict().parse(req.body);
  res.json(await onboarding.complete(input.token,input.proof,input.password,input.confirmation));
});
institutionRoutes.post('/invitations/decline-proof',authRateLimit(10,3600_000),async(req,res)=>{
  const {token,proof}=z.object({token:invitationToken,proof:invitationToken}).strict().parse(req.body);
  res.json(await onboarding.declineWithProof(token,proof));
});
institutionRoutes.use(requireAuth);
institutionRoutes.post('/invitations/decline', authRateLimit(10,3600_000), async (req:AuthenticatedRequest,res)=>{
  const {token}=z.object({token:invitationToken}).strict().parse(req.body);
  res.json(await onboarding.decline(token,req.auth!));
});
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
// Preserve legacy URLs as explicit denials; no global academic service is called.
institutionRoutes.get('/admin/classes',(_req,_res,next)=>next(new ApiError(403,'Turmas pertencem à administração institucional autorizada.')));
institutionRoutes.patch('/admin/classes/:id',(_req,_res,next)=>next(new ApiError(403,'A administração global não pode gerir turmas.')));
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
institutionRoutes.put('/admin/institutions/:id/details',async(req:AuthenticatedRequest,res)=>{
  const input=z.object({name:z.string().trim().min(2).max(180).optional(),phone:z.string().trim().min(8).max(25).regex(/^\+?[\d ()-]+$/).optional(),description:z.string().trim().min(10).max(2000).optional(),responsibleEmail:z.string().trim().email().max(254).optional(),reason:z.string().trim().min(3).max(500)}).strict().refine(v=>Object.keys(v).length>1).parse(req.body);
  res.json(await service.editAdministrativeInstitution(req.auth!,id(req),input));
});
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
          .enum(["PENDING", "ACCEPTED", "EXPIRED", "CANCELLED", "DECLINED"])
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
    const input=z.object({email:z.string().trim().email().max(254).toLowerCase(),name:z.string().trim().min(2).max(120).optional(),classIds:z.array(z.string().uuid()).max(30).optional()}).strict().parse(req.body);
    res.status(201).json(
      await service.invite(
        req.auth!,
        id(req),
        input.email, undefined, input,
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
