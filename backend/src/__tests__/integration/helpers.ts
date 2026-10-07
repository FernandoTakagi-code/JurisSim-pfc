import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcrypt';
import express from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../../lib/prisma';
import { prisma as prismaQuestoes } from '../../config/prisma';
import { authRoutes } from '../../routes/auth-routes';
import questaoRoutes from '../../routes/questaoRoutes';
import { errorHandler } from '../../middlewares/error-handler';

export { prisma };

// Monta a mesma API do server.ts (sem chamar listen na porta fixa).
export async function iniciarServidor() {
  const app = express();
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/questoes', questaoRoutes);
  app.use(errorHandler);
  const server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s));
  });
  const { port } = server.address() as AddressInfo;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

export async function encerrar(server?: Server) {
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await prisma.$disconnect();
  await prismaQuestoes.$disconnect();
}

// Limpa todas as tabelas do banco de teste para que cada teste monte o próprio cenário.
export async function limparBanco() {
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename <> '_prisma_migrations'`;
  if (tabelas.length === 0) return;
  const lista = tabelas.map(({ tablename }) => `"${tablename}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
}

export async function criarUsuario(role: 'ALUNO' | 'PROFESSOR', senha = 'senha-de-teste') {
  return prisma.user.create({
    data: {
      nome: role === 'PROFESSOR' ? 'Prof. Carla' : 'Aluno João',
      email: `${role.toLowerCase()}-${randomUUID()}@jurissim.test`,
      role,
      senhaHash: await bcrypt.hash(senha, 4),
      emailVerifiedAt: new Date(),
    },
  });
}

export function tokenPara(usuario: { id: string; role: string }) {
  return jwt.sign({ id: usuario.id, role: usuario.role }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '1h' });
}

export function questaoValida(sobrescrever: Record<string, unknown> = {}) {
  return {
    enunciado: 'Marta permaneceu no imóvel locado por mais de 30 dias após o fim do prazo. Assinale a correta.',
    disciplina: 'Direito Civil',
    assunto: 'Locação',
    nivel: 'INTERMEDIARIO',
    fundamentacaoJuridica: 'Art. 46, §1º, da Lei 8.245/91',
    publica: true,
    alternativas: [
      { texto: 'A locação se extingue de pleno direito.', correta: false },
      { texto: 'Presume-se prorrogada por prazo indeterminado.', correta: true },
      { texto: 'Renova-se automaticamente por mais 30 meses.', correta: false },
      { texto: 'O locador pode exigir a saída em 15 dias.', correta: false },
    ],
    ...sobrescrever,
  };
}

export async function requisicao(baseUrl: string, metodo: string, caminho: string, opcoes: { token?: string; corpo?: unknown } = {}) {
  const resposta = await fetch(`${baseUrl}${caminho}`, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(opcoes.token ? { Authorization: `Bearer ${opcoes.token}` } : {}),
    },
    body: opcoes.corpo === undefined ? undefined : JSON.stringify(opcoes.corpo),
  });
  const texto = await resposta.text();
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null };
}