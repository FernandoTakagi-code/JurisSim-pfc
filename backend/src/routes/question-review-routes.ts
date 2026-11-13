import { Router } from "express";
import { z } from "zod";
import {
  requireAuth,
  requireRoles,
  type AuthenticatedRequest,
} from "../middlewares/auth-middleware";
import { QuestionReviewService } from "../services/question-review-service";
export function isQuestionReviewEnabled() {
  return (
    process.env.QUESTION_REVIEW_SCHEMA_ENABLED === "true" &&
    process.env.QUESTION_REVIEW_API_ENABLED === "true"
  );
}
const filter = z.enum(["all", "incorrect"]).default("incorrect");
const start = z
  .object({
    discipline: z.string().trim().min(1).max(100),
    topic: z.string().trim().min(1).max(150).nullable().optional(),
    quantity: z.number().int().min(1).max(20),
    filter,
  })
  .strict();
export function createQuestionReviewRoutes(
  options: { isEnabled?: () => boolean; service?: QuestionReviewService } = {},
) {
  const router = Router(),
    service = options.service ?? new QuestionReviewService();
  router.use((_req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!(options.isEnabled ?? isQuestionReviewEnabled)()) {
      res.status(503).json({ message: "A revisão está em preparação." });
      return;
    }
    next();
  });
  router.use(requireAuth, requireRoles("ALUNO"));
  router.get(
    "/catalog/:discipline/availability",
    async (req: AuthenticatedRequest, res) => {
      const topic = z
        .string()
        .trim()
        .min(1)
        .max(150)
        .optional()
        .parse(req.query.topic);
      res.json(
        await service.availability(
          req.auth!.userId,
          z.string().trim().min(1).max(100).parse(req.params.discipline),
          topic ?? null,
          filter.parse(req.query.filter),
        ),
      );
    },
  );
  router.post("/", async (req: AuthenticatedRequest, res) => {
    const b = start.parse(req.body),
      r = await service.start(
        req.auth!.userId,
        b.discipline,
        b.topic ?? null,
        b.quantity,
        b.filter,
      );
    res.status(r.resumed ? 200 : 201).json(r);
  });
  router.get("/:id", async (req: AuthenticatedRequest, res) => {
    res.json({
      attempt: await service.get(
        req.auth!.userId,
        z.uuid().parse(req.params.id),
      ),
    });
  });
  router.put(
    "/:id/answers/:questionId",
    async (req: AuthenticatedRequest, res) => {
      const b = z.object({ alternativeId: z.uuid() }).strict().parse(req.body);
      res.json(
        await service.answer(
          req.auth!.userId,
          z.uuid().parse(req.params.id),
          z.uuid().parse(req.params.questionId),
          b.alternativeId,
        ),
      );
    },
  );
  router.post("/:id/finalize", async (req: AuthenticatedRequest, res) => {
    res.json({
      result: await service.finalize(
        req.auth!.userId,
        z.uuid().parse(req.params.id),
      ),
    });
  });
  router.get("/:id/result", async (req: AuthenticatedRequest, res) => {
    res.json({
      result: await service.getResult(
        req.auth!.userId,
        z.uuid().parse(req.params.id),
      ),
    });
  });
  return router;
}
export const questionReviewRoutes = createQuestionReviewRoutes();
