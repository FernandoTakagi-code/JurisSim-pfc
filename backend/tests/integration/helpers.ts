import {activityRoutes} from "../../src/routes/class-activity-routes";
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import bcrypt from 'bcrypt';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import { prisma } from "../../src/lib/prisma";
import initialTerms from "../../src/terms-of-use/initial-terms.json";
import { resetTermsCache } from "../../src/services/accounts/terms-of-use";
import { prisma as prismaQuestoes } from "../../src/config/prisma";
import { authRoutes } from "../../src/routes/auth-routes";
import questaoRoutes from "../../src/routes/questaoRoutes";
import { classRoutes, examRoutes } from "../../src/routes/class-exam-routes";
import { errorHandler } from "../../src/middlewares/error-handler";
import { assertDisposableDatabase } from './disposable-database';

export { prisma };

// Monta a mesma API do server.ts (sem chamar listen na porta fixa).
export async function iniciarServidor() {
  const app = express();
  app.use(cors({origin:'http://127.0.0.1:5199'}));
  app.get('/test/disposable-proof',async(_req,res)=>{await assertDisposableDatabase(prisma);res.json({capability:process.env.JURISSIM_TEST_CAPABILITY});});
  app.use(express.json());
  app.use('/auth', authRoutes);
  app.use('/questoes', questaoRoutes);
  app.use('/turmas', classRoutes);
  app.use('/avaliacoes', examRoutes);
app.use('/atividades', activityRoutes);
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
  await assertDisposableDatabase(prisma);
  const tabelas = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = current_schema() AND tablename NOT IN ('_prisma_migrations', 'TermsOfUseVersion')`;
  // TermsOfUseVersion é dado de referência gravado pela migração (versão em vigor dos Termos), como o histórico de migrations.
  if (tabelas.length === 0) return;
  const lista = tabelas.map(({ tablename }) => `"${tablename.replace(/"/g, '""')}"`).join(', ');
  // Este helper já verificou o cluster descartável do harness.
  // Limpa todas as tabelas de fixture em uma única transação sem enfraquecer o trigger
  // de auditoria somente-anexação implantado. O LOCAL restaura a aplicação do trigger no commit.
  await prisma.$transaction(async tx => {
    await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${lista} RESTART IDENTITY CASCADE`);
    // O CASCADE a partir de "User" também esvazia TermsOfUseVersion (FK de quem publicou).
    // Regrava a versão inicial exatamente como a migração, para os Termos continuarem em vigor.
    await tx.termsOfUseVersion.upsert({
      where: { version: '2026-11-13.1' },
      create: { id: '00000000-0000-4000-8000-0000000013a1', version: '2026-11-13.1', sections: initialTerms, publishedAt: new Date('2026-11-13T03:00:00.000Z') },
      update: {},
    });
  });
  resetTermsCache();
}

export async function criarUsuario(role: 'ALUNO' | 'PROFESSOR', senha = 'senha-de-teste') {
  return prisma.user.create({
    data: {
      nome: role === 'PROFESSOR' ? 'Prof. Carla' : 'Aluno João',
      termsVersion: '2026-11-13.1', privacyVersion: '2026-11-22.1', legalAcceptedAt: new Date(),
      email: `${role.toLowerCase()}-${randomUUID()}@jurissim.test`,
      role,
      senhaHash: await bcrypt.hash(senha, 4),
      emailVerifiedAt: new Date(),
    },
  });
}

// Cria o usuário no banco de teste e obtém o token pelo endpoint real de login.
export async function loginPelaApi(baseUrl: string, role: 'ALUNO' | 'PROFESSOR') {
  const senha = `senha-${randomUUID()}`;
  const usuario = await criarUsuario(role, senha);
  const login = await requisicao(baseUrl, 'POST', '/auth/login', { corpo: { email: usuario.email, senha, perfil: role } });
  if (login.status !== 200) throw new Error(`Login de teste falhou com status ${login.status}`);
  return { usuario, token: login.corpo.token as string };
}

export function tokenPara(usuario: { id: string; role: string; sessionVersion: number }) {
  return jwt.sign({ id: usuario.id, role: usuario.role, sessionVersion: usuario.sessionVersion }, process.env.JWT_SECRET!, { algorithm: 'HS256', expiresIn: '1h' });
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
  return { status: resposta.status, corpo: texto ? JSON.parse(texto) : null, headers: resposta.headers };
}
