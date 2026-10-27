import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { CORS_HEADERS, CORS_METHODS, corsOriginsFromEnvironment, isAllowedCorsOrigin, isValidCorsPreflight } from './config/cors-policy';
import { errorHandler } from './middlewares/error-handler';
import { requireAuth } from './middlewares/auth-middleware';

import { requireInitialDiagnosticCompletion } from './middlewares/initial-diagnostic-required';
import { isInitialDiagnosticRequired } from './config/initial-diagnostic-feature';
import { diagnosticRoutes } from './routes/diagnostic-routes';
import { initialDiagnosticRoutes } from './routes/initial-diagnostic-routes';
import { questionPracticeRoutes } from './routes/question-practice-routes';
import { authRoutes } from './routes/auth-routes';
import questaoRoutes from './routes/questaoRoutes';
import { trailRoutes } from './routes/trail-routes';
import { auditRoutes } from './routes/audit-routes';
import { studentHistoryRoutes } from './routes/student-history-routes';
import { classRoutes, examRoutes } from './routes/class-exam-routes';
import { goalRoutes, reportRoutes } from './routes/goals-reports-routes';
import { profilePhotoRoutes } from './routes/profile-photo-routes';
import { prisma } from './lib/prisma';
import { isLocalDiagnosticDemoRequested, isLocalEmailCaptureRequested, localEmailVerificationCapture } from './services/local-email-capture';
import { setDefaultAutoSelectFamily } from 'node:net';
setDefaultAutoSelectFamily(false);

const app = express();

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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'JurisSim API rodando' });
});
app.use('/auth', authRoutes);
// These study routes are behind a server-side initial-diagnostic gate. Auth is
// checked here before the gate; route-level authorization remains in place.
app.use([
  '/questoes', '/trilhas', '/diagnostics', '/students/me', '/turmas',
  '/avaliacoes', '/goals', '/reports', '/question-practice', '/profile/photo',
], (request, response, next) => isInitialDiagnosticRequired()
  ? requireAuth(request, response, next)
  : next(), requireInitialDiagnosticCompletion);
app.use('/questoes', questaoRoutes);
app.use('/trilhas', trailRoutes);
app.use('/diagnostics', diagnosticRoutes);
app.use('/initial-diagnostic', initialDiagnosticRoutes);
app.use('/question-practice', questionPracticeRoutes);
app.use('/audit-logs', auditRoutes);
app.use('/students/me', studentHistoryRoutes);
app.use('/turmas', classRoutes);
app.use('/avaliacoes', examRoutes);
app.use('/goals', goalRoutes);
app.use('/reports', reportRoutes);
app.use('/profile/photo', profilePhotoRoutes);
app.use(errorHandler);

const PORT = Number(env.PORT);

async function startServer() {
  if (isLocalEmailCaptureRequested() || isLocalDiagnosticDemoRequested()) {
    try {
      localEmailVerificationCapture.assertLocalConfiguration();
      if (isLocalDiagnosticDemoRequested()) localEmailVerificationCapture.assertLocalDiagnosticDemoConfiguration();
      const identity = await prisma.$queryRawUnsafe<any[]>(`SELECT current_database() AS database,
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
