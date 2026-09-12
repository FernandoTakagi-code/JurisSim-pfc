import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { errorHandler } from './middlewares/error-handler';
import { diagnosticRoutes } from './routes/diagnostic-routes';
import { authRoutes } from './routes/auth-routes';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'JurisSim API rodando' });
});

app.use('/diagnostics', diagnosticRoutes);
app.use('/auth', authRoutes);
app.use(errorHandler);

const PORT = process.env.PORT || 3333;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
