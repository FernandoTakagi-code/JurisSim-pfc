import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import authRoutes from './routes/authRoutes';
import { authMiddleware, AuthenticatedRequest } from './middlewares/authMiddleware';
import { roleMiddleware } from './middlewares/roleMiddleware';

const app = express();

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'JurisSim API rodando' });
});

app.listen(env.PORT, () => {
  console.log(`Servidor rodando na porta ${env.PORT}`);
});
