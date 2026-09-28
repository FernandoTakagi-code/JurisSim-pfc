import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { errorHandler } from './middlewares/error-handler';
import { diagnosticRoutes } from './routes/diagnostic-routes';
import { authRoutes } from './routes/auth-routes';
import questaoRoutes from './routes/questaoRoutes';
import { trailRoutes } from './routes/trail-routes';
import { auditRoutes } from './routes/audit-routes';
import { setDefaultAutoSelectFamily } from 'node:net';
setDefaultAutoSelectFamily(false);

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'JurisSim API rodando' });
});
app.use('/questoes', questaoRoutes);
app.use('/trilhas', trailRoutes);
app.use('/diagnostics', diagnosticRoutes);
app.use('/auth', authRoutes);
app.use('/audit-logs', auditRoutes);
app.use(errorHandler);

const PORT = env.PORT;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});