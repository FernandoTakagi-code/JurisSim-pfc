import {activityRoutes} from "./routes/class-activity-routes";
import express from 'express';
import cors from 'cors';
import { configureHttpSecurity } from './config/http-security';
import { env } from './config/env';
import { CORS_HEADERS, CORS_METHODS, corsOriginsFromEnvironment, isAllowedCorsOrigin, isValidCorsPreflight } from './config/cors-policy';
import { errorHandler } from './middlewares/error-handler';
import { requireAuth } from './middlewares/auth-middleware';

import { requireInitialDiagnosticCompletion } from './middlewares/initial-diagnostic-required';
import { isInitialDiagnosticRequired } from './config/initial-diagnostic-feature';
import { diagnosticRoutes } from './routes/diagnostic-routes';
import { initialDiagnosticRoutes } from './routes/initial-diagnostic-routes';
import { questionPracticeRoutes } from './routes/question-practice-routes';
import { questionReviewRoutes } from './routes/question-review-routes';
import { createIndividualExamRoutes } from './routes/individual-exam-routes';
import { authRoutes } from './routes/auth-routes';
import questaoRoutes from './routes/questaoRoutes';
import { trailRoutes } from './routes/trail-routes';
import { auditRoutes } from './routes/audit-routes';
import { studentHistoryRoutes } from './routes/student-history-routes';
import { classRoutes, examRoutes } from './routes/class-exam-routes';
import { goalRoutes, reportRoutes } from './routes/goals-reports-routes';
import { profilePhotoRoutes } from './routes/profile-photo-routes';
import { institutionRoutes } from './routes/institution-routes';
import { legalRoutes } from './routes/legal-routes';
import { administrationAudit } from './middlewares/administration-audit';
import { localReadOnlyNavigation } from './middlewares/local-read-only-navigation';
import { createQuestionEditorialRoutes } from './routes/question-editorial-routes';
import {denyGlobalAcademicAccess} from './middlewares/academic-access';
import { prisma } from './lib/prisma';
import { isLocalDiagnosticDemoRequested, isLocalEmailCaptureRequested, localEmailVerificationCapture } from './services/email/local-email-capture';
import { setDefaultAutoSelectFamily } from 'node:net';
import { assertInstitutionActivationReady, InstitutionActivationBlocked } from './services/institutions/institution-activation';
setDefaultAutoSelectFamily(false);

const app = express();
configureHttpSecurity(app);

const corsOrigins = corsOriginsFromEnvironment();
app.use((request, response, next) => {
  if (request.method !== 'OPTIONS' || !request.get('access-control-request-method')) return next();
  const origin = request.get('origin');
  if (!origin) return next();
  if (!isAllowedCorsOrigin(origin, corsOrigins) ||
    !isValidCorsPreflight(request.get('access-control-request-method'), request.get('access-control-request-headers'))) {
    response.status(403).end();
    return;
  }
  next();
});
app.use(cors({
  origin: (origin, callback) => callback(null, Boolean(origin && isAllowedCorsOrigin(origin, corsOrigins))),
  methods: [...CORS_METHODS],
  allowedHeaders: [...CORS_HEADERS],
  optionsSuccessStatus: 204,
  maxAge: 600,
}));
app.use(express.json());
app.use(administrationAudit);
app.use(localReadOnlyNavigation);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', message: 'JurisSim API rodando' });
});
app.use('/auth', authRoutes);
app.use('/institutions', institutionRoutes);
app.use('/legal', legalRoutes);
app.use('/question-editorial', createQuestionEditorialRoutes());
app.use(['/questoes','/trilhas','/diagnostics','/initial-diagnostic','/students/me','/turmas','/atividades', '/avaliacoes','/goals','/reports','/question-practice','/individual-exams','/question-review'],requireAuth,denyGlobalAcademicAccess);
// Estas rotas de estudo ficam atrás de um bloqueio de diagnóstico inicial no servidor. A
// autenticação é verificada aqui antes do bloqueio; a autorização no nível da rota continua valendo.
app.use([
  '/questoes', '/trilhas', '/diagnostics', '/students/me', '/turmas',
  '/atividades', '/avaliacoes', '/goals', '/reports', '/question-practice', '/profile/photo', '/individual-exams', '/question-review',
], (request, response, next) => isInitialDiagnosticRequired()
  ? requireAuth(request, response, next)
  : next(), requireInitialDiagnosticCompletion);
app.use('/questoes', questaoRoutes);
app.use('/trilhas', trailRoutes);
app.use('/diagnostics', diagnosticRoutes);
app.use('/initial-diagnostic', initialDiagnosticRoutes);
app.use('/question-practice', questionPracticeRoutes);
app.use('/question-review', questionReviewRoutes);
app.use('/individual-exams', createIndividualExamRoutes());
app.use('/audit-logs', auditRoutes);
app.use('/students/me', studentHistoryRoutes);
app.use('/turmas', classRoutes);
app.use('/avaliacoes', examRoutes);
app.use('/atividades', activityRoutes);
app.use('/goals', goalRoutes);
app.use('/reports', reportRoutes);
app.use('/profile/photo', profilePhotoRoutes);
app.use(errorHandler);

const PORT = Number(env.PORT);

async function startServer() {
  // Recusa a ativação antes do listen, em vez de rebaixar silenciosamente professores legados.
  try { await assertInstitutionActivationReady(prisma); }
  catch (error) {
    console.error(error instanceof InstitutionActivationBlocked ? error.message
      : 'Ativação institucional recusada: não foi possível verificar a transição. Mantenha INSTITUTIONS_ENABLED=false.');
    await prisma.$disconnect();
    process.exitCode = 1;
    return;
  }
  if (isLocalEmailCaptureRequested() || isLocalDiagnosticDemoRequested()) {
    try {
      localEmailVerificationCapture.assertLocalConfiguration();
      if (isLocalDiagnosticDemoRequested()) localEmailVerificationCapture.assertLocalDiagnosticDemoConfiguration();
      const identity = await prisma.$queryRawUnsafe<{ database: string; username: string; address: string; port: number;
        systemIdentifier: string; versionMajor: number }[]>(`SELECT current_database() AS database,
        current_user AS username, inet_server_addr()::text AS address, inet_server_port() AS port,
        (pg_control_system()).system_identifier::text AS "systemIdentifier",
        split_part(current_setting('server_version'), '.', 1)::int AS "versionMajor"`);
      if (identity.length !== 1) throw new Error('Unable to verify the database identity.');
      localEmailVerificationCapture.validateDatabaseIdentity(identity[0]);
      if (isLocalDiagnosticDemoRequested() && !localEmailVerificationCapture.isLocalDiagnosticDemoEnabled) {
        throw new Error('Local demo mode did not pass its isolated runtime checks.');
      }
    } catch {
      console.error('Backend startup refused: local email capture could not validate the approved local PostgreSQL cluster.');
      await prisma.$disconnect();
      process.exitCode = 1;
      return;
    }
  }

  app.listen(PORT, env.HOST, () => {
    console.log(`Servidor rodando na porta ${PORT}`);
  });
}

void startServer();
