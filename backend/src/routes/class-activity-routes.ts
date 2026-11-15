import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middlewares/auth-middleware";
import { denyGlobalAcademicAccess } from "../middlewares/academic-access";
import { ClassActivityService } from "../services/class-activity-service";
import {ClassExamService} from '../services/class-exam-service';
const service = new ClassActivityService();
const exams=new ClassExamService();
export const activityRoutes = Router();
activityRoutes.use(requireAuth, denyGlobalAcademicAccess, (_req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
const id = (req: AuthenticatedRequest) =>
  z.string().uuid().parse(req.params.id);
activityRoutes.get('/:id/results',requireRoles('PROFESSOR'),async(req:AuthenticatedRequest,res)=>{
  const {page}=z.object({page:z.coerce.number().int().min(1).max(1000).default(1)}).strict().parse(req.query);
  res.json(await exams.examDetails(req.auth!,id(req),page,true));
});
const schema = z
  .object({
    classId: z.string().uuid(),
    titulo: z.string().trim().min(2).max(150),
    maxPoints:z.number().positive().max(1000).multipleOf(0.01).default(10),
    descricao: z.string().trim().max(3000).default(""),
    questaoIds: z
      .array(z.string().uuid())
      .min(1)
      .max(80)
      .refine(
        (ids) => new Set(ids).size === ids.length,
        "Não repita questões.",
      ),
    dueAt: z
      .string()
      .datetime({ offset: true })
      .transform((s) => new Date(s))
      .nullable()
      .default(null),
  })
  .strict();
activityRoutes.get("/", async (req: AuthenticatedRequest, res) => {
  const q = z
    .object({
      classId: z.string().uuid().optional(),
      page: z.coerce.number().int().min(1).max(1000).default(1),
    })
    .strict()
    .parse(req.query);
  res.json(await service.list(req.auth!, q.classId, q.page));
});
activityRoutes.get(
  "/questions",
  requireRoles("PROFESSOR"),
  async (req: AuthenticatedRequest, res) => {
    const q = z
      .object({
        classId: z.string().uuid(),
        page: z.coerce.number().int().min(1).max(1000).default(1),
      })
      .strict()
      .parse(req.query);
    res.json(await service.questions(req.auth!, q.classId, q.page));
  },
);
activityRoutes.post(
  "/",
  requireRoles("PROFESSOR"),
  async (req: AuthenticatedRequest, res) =>
    res.status(201).json(await service.save(req.auth!, schema.parse(req.body))),
);
activityRoutes.put(
  "/:id",
  requireRoles("PROFESSOR"),
  async (req: AuthenticatedRequest, res) =>
    res.json(await service.save(req.auth!, schema.parse(req.body), id(req))),
);
activityRoutes.post(
  "/:id/publish",
  requireRoles("PROFESSOR"),
  async (req: AuthenticatedRequest, res) =>
    res.json(await service.publish(req.auth!, id(req))),
);
activityRoutes.post(
  "/:id/close",
  requireRoles("PROFESSOR"),
  async (req: AuthenticatedRequest, res) =>
    res.json(await service.end(req.auth!, id(req), false)),
);
activityRoutes.post(
  "/:id/cancel",
  requireRoles("PROFESSOR"),
  async (req: AuthenticatedRequest, res) =>
    res.json(await service.end(req.auth!, id(req), true)),
);
