import assert from 'node:assert/strict';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import { assertDisposableDatabase } from '../../src/__tests__/integration/disposable-database';
import { INITIAL_DIAGNOSTIC_DISCIPLINES } from '../../src/services/initial-diagnostic-config';
import versions from '../../src/legal-versions.json';

const stages = [{ name: 'smoke', vus: 1 }, { name: 'five', vus: 5 }, { name: 'ten', vus: 10 },
  { name: 'twenty', vus: 20 }, { name: 'thirty', vus: 30 }, { name: 'spike', vus: 30 }];
const prisma = new PrismaClient();
let api: ChildProcess | undefined, generator: ChildProcess | undefined;
const output = path.resolve('.local', 'load-' + new Date().toISOString().replace(/[:.]/g, '-'));
type Summary = { metrics: Record<string, { values: Record<string, number>; thresholds?: Record<string, { ok: boolean }> }> };
const summaries: { stage: string; users: number; passed: boolean; requests: number; commonP95: number; finalizeP95: number; loginP95: number; errorRate: number }[] = [];

async function unusedPort() {
  const socket = net.createServer(); socket.listen(0, '127.0.0.1'); await once(socket, 'listening');
  const port = (socket.address() as net.AddressInfo).port;
  await new Promise<void>(resolve => socket.close(() => resolve())); return port;
}
async function exitCode(child: ChildProcess) {
  return new Promise<number>((resolve, reject) => {
    child.once('error', reject); child.once('exit', code => resolve(code ?? 1));
  });
}
const pause = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
async function main() {
  await assertDisposableDatabase(prisma); // Before the first write, HTTP call or fixture creation.
  assert.ok(process.env.JURISSIM_K6_BIN && fs.statSync(process.env.JURISSIM_K6_BIN).isFile(), 'Official k6 executable required.');
  fs.mkdirSync(output, { recursive: true });
  console.log('LOAD: isolated reports: ' + output);
  const password = randomBytes(24).toString('hex'), hash = await bcrypt.hash(password, 10);
  const reviewer = await prisma.user.create({ data: { nome: 'LOAD_FIXTURE_ONLY author', email: 'load-author@example.invalid', role: 'ADMIN', emailVerifiedAt: new Date() } });
  const accounts = [];
  for (let index = 0; index < 96; index++) {
    const user = await prisma.user.create({ data: { nome: 'LOAD_FIXTURE_ONLY student ' + index,
      email: `load-${index}@example.invalid`, senhaHash: hash, role: 'ALUNO', emailVerifiedAt: new Date(),
      legalAcceptedAt: new Date(), termsVersion: versions.termsVersion, privacyVersion: versions.privacyVersion } });
    accounts.push({ id: user.id, email: user.email, password });
  }
  for (const discipline of INITIAL_DIAGNOSTIC_DISCIPLINES) for (const level of ['BASICO', 'INTERMEDIARIO', 'AVANCADO'] as const) {
    for (let index = 0; index < 10; index++) await prisma.questao.create({ data: {
      enunciado: `LOAD_FIXTURE_ONLY ${discipline} ${level} ${index}. ` + 'Conteúdo sintético usado exclusivamente para medir a API, sem validade jurídica. '.repeat(12),
      disciplina: discipline, assunto: 'LOAD_FIXTURE_ONLY', nivel: level, fundamentacaoJuridica: 'Explicação sintética de desempenho. '.repeat(20),
      publica: true, origem: 'IA', autorId: reviewer.id, revisaoJuridicaEm: new Date(), revisorJuridicoId: reviewer.id,
      revisaoPedagogicaEm: new Date(), revisorPedagogicoId: reviewer.id, liberadaAcervoEm: new Date(), liberadaAcervoPorId: reviewer.id,
      alternativas: { create: (['A', 'B', 'C', 'D'] as const).map(letra => ({ letra, texto: `LOAD_FIXTURE_ONLY opção ${letra} de conteúdo fictício.`, correta: letra === 'A' })) },
    } });
  }
  const port = await unusedPort(), baseUrl = `http://127.0.0.1:${port}`;
  const runtimeFile = path.join(output, 'runtime.jsonl');
  const log = fs.openSync(path.join(output, 'api.log'), 'wx');
  const apiEnv = { ...process.env, HOST: '127.0.0.1', PORT: String(port), TRUST_PROXY_HOPS: '0',
    INITIAL_DIAGNOSTIC_API_ENABLED: 'true', INITIAL_DIAGNOSTIC_REQUIRED: 'true', INITIAL_DIAGNOSTIC_COMPOSITION_MODE: 'AUTORAL_30',
    INITIAL_DIAGNOSTIC_PILOT_ENABLED: 'false', INITIAL_DIAGNOSTIC_PILOT_BATCH_ID: '',
    INDIVIDUAL_EXAM_SCHEMA_ENABLED: 'true', INDIVIDUAL_EXAM_API_ENABLED: 'true', INDIVIDUAL_EXAM_PILOT_ENABLED: 'false',
    INDIVIDUAL_EXAM_PILOT_BATCH_ID: '', INDIVIDUAL_EXAM_PILOT_BATCH_IDS: '',
    QUESTION_PRACTICE_SCHEMA_ENABLED: 'true', QUESTION_PRACTICE_API_ENABLED: 'true', QUESTION_PRACTICE_PILOT_ENABLED: 'false',
    QUESTION_PRACTICE_PILOT_BATCH_ID: '', QUESTION_PRACTICE_PILOT_BATCH_IDS: '',
    QUESTION_REVIEW_SCHEMA_ENABLED: 'true', QUESTION_REVIEW_API_ENABLED: 'true',
    SEED_LOCAL_DATABASE: 'false', LOCAL_EMAIL_CAPTURE_ENABLED: 'false', LOCAL_DIAGNOSTIC_DEMO_ENABLED: 'false',
    JURISSIM_LOAD_RUNTIME_FILE: runtimeFile };
  api = spawn(process.execPath, ['--import', 'tsx', 'scripts/load/api-under-test.ts'], { cwd: process.cwd(), env: apiEnv, stdio: ['ignore', log, log], windowsHide: true });
  const started = performance.now();
  let ready = false;
  while (performance.now() - started < 20000) {
    if (api.exitCode !== null) throw new Error('Benchmark API exited during startup. Inspect its local log.');
    try { ready = (await fetch(baseUrl + '/health', { signal: AbortSignal.timeout(1000) })).ok; } catch { /* Startup is measured separately. */ }
    if (ready) break;
    await pause(200);
  }
  assert.ok(ready, 'Benchmark API did not become ready.');
  const startupMs = performance.now() - started;
  let offset = 0;
  for (const stage of stages) {
    const fixtureFile = path.join(output, `${stage.name}-fixtures.json`), summaryFile = path.join(output, `${stage.name}-summary.json`);
    fs.writeFileSync(fixtureFile, JSON.stringify({ syntheticOnly: true, baseUrl, stage: stage.name, accounts: accounts.slice(offset, offset + stage.vus) }), { flag: 'wx' });
    offset += stage.vus;
    const k6Env = Object.fromEntries(Object.entries(process.env).filter(([key]) => ['PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'USERPROFILE', 'APPDATA', 'LOCALAPPDATA'].includes(key.toUpperCase())));
    Object.assign(k6Env, { BASE_URL: baseUrl, FIXTURE_FILE: fixtureFile, SUMMARY_FILE: summaryFile, K6_NO_USAGE_REPORT: 'true' });
    const stageLog = fs.openSync(path.join(output, `${stage.name}-k6.log`), 'wx');
    console.log(`LOAD START: ${stage.name}, ${stage.vus} simultaneous synthetic students`);
    generator = spawn(process.env.JURISSIM_K6_BIN!, ['run', '--quiet', '--no-usage-report', 'scripts/load/workload.js'], { cwd: process.cwd(), env: k6Env, stdio: ['ignore', stageLog, stageLog], windowsHide: true });
    const result = await exitCode(generator); fs.closeSync(stageLog); fs.unlinkSync(fixtureFile);
    assert.ok(fs.existsSync(summaryFile), 'k6 did not produce a summary. Inspect its stage log.');
    const summary: Summary = JSON.parse(fs.readFileSync(summaryFile, 'utf8'));
    const value = (name: string, stat: string) => summary.metrics[name]?.values[stat] ?? NaN;
    const passed = result === 0 && Object.values(summary.metrics).every(metric => Object.values(metric.thresholds ?? {}).every(threshold => threshold.ok));
    const row = { stage: stage.name, users: stage.vus, passed, requests: value('http_reqs', 'count'), commonP95: value('http_req_duration{kind:common}', 'p(95)'),
      finalizeP95: value('http_req_duration{kind:finalize}', 'p(95)'), loginP95: value('http_req_duration{kind:login}', 'p(95)'), errorRate: value('http_req_failed', 'rate') };
    summaries.push(row); fs.writeFileSync(path.join(output, 'stages.json'), JSON.stringify(summaries, null, 2));
    console.log('LOAD RESULT: ' + JSON.stringify(row));
    assert.ok(passed, `Stage ${stage.name} failed; later load stages were stopped.`);
  }

  const ids = accounts.map(account => account.id);
  const attempts = await prisma.simulado.findMany({ where: { alunoId: { in: ids } }, include: { respostas: true, questoes: true, desempenhosDiagnostico: true } });
  const options = await prisma.alternativa.findMany({ where: { questao: { autorId: reviewer.id } }, select: { id: true, questaoId: true, letra: true } });
  assert.equal(attempts.length, 126, '96 diagnostics plus 30 individual exams, no duplicate attempts');
  for (const account of accounts) {
    const own = attempts.filter(attempt => attempt.alunoId === account.id);
    assert.equal(own.filter(attempt => attempt.tipo === 'DIAGNOSTICO').length, 1);
    assert.equal(own.length, accounts.indexOf(account) >= 66 ? 2 : 1);
    const seen = new Set<string>();
    for (const attempt of own) {
      assert.ok(attempt.finalizadoEm); assert.equal(attempt.questoes.length, 30); assert.equal(attempt.respostas.length, 30);
      assert.equal(attempt.respostas.filter(answer => answer.correta).length, 15);
      for (const question of attempt.questoes) {
        assert.ok(!seen.has(question.questaoId), 'No questions repeated between diagnostic and exam'); seen.add(question.questaoId);
        const expected = options.find(option => option.questaoId === question.questaoId && option.letra === (question.posicao % 2 ? 'A' : 'B'));
        const answer = attempt.respostas.find(item => item.questaoId === question.questaoId);
        assert.equal(answer?.alternativaEscolhidaId, expected?.id, 'Exact per-question selection preserved for its owner');
      }
      const metricKeys = attempt.desempenhosDiagnostico.map(metric => JSON.stringify([metric.tipo, metric.disciplina, metric.assunto, metric.nivel]));
      assert.equal(new Set(metricKeys).size, metricKeys.length, 'No duplicated performance metrics');
    }
  }
  const login = async (index: number) => {
    const response = await fetch(baseUrl + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: accounts[index].email, senha: password }) });
    assert.equal(response.status, 200); return (await response.json()).token as string;
  };
  const token = await login(0), foreign = attempts.find(attempt => attempt.alunoId === accounts[1].id)!;
  const denied = await fetch(`${baseUrl}/initial-diagnostic/${foreign.id}/result`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(denied.status, 404, 'No access to another student after concurrent load');
  const own = attempts.find(attempt => attempt.alunoId === accounts[0].id)!;
  const immutable = await fetch(`${baseUrl}/initial-diagnostic/${own.id}/answers/${own.questoes[0].questaoId}`, { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ selectedOptionId: own.respostas[0].alternativaEscolhidaId }) });
  assert.equal(immutable.status, 409, 'A completed attempt remains immutable');
  const runtime = fs.readFileSync(runtimeFile, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const report = { generatedAt: new Date().toISOString(), testedCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8', windowsHide: true }).trim(),
    environment: 'Disposable local PostgreSQL and actual HTTP API; not Render/Supabase capacity',
    mode: 'AUTORAL_30, public synthetic reviewed fixtures; external providers disabled; bcrypt cost 10; startup excluded from k6 percentiles',
    node: process.version, logicalCpus: os.availableParallelism(), startupMs,
    peakApiRssMB: Math.max(...runtime.map(sample => sample.rssBytes)) / 1024 / 1024,
    peakCpuCoresUsed: Math.max(...runtime.map(sample => sample.cpuCoresUsed)),
    peakEventLoopUtilization: Math.max(...runtime.map(sample => sample.eventLoopUtilization)),
    stages: summaries, integrity: { passed: true, students: accounts.length, attempts: attempts.length, answers: attempts.reduce((sum, attempt) => sum + attempt.respostas.length, 0), noDuplicateAttempts: true, noLostAnswers: true, exactSelectionsPreserved: true, correctScores: true, noRepeatedQuestions: true, isolatedAccounts: true, immutableResults: true } };
  fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log('LOAD INTEGRITY: ' + JSON.stringify(report.integrity));
  console.log('LOAD REPORT: ' + path.join(output, 'report.json'));
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { generator?.kill(); api?.kill(); process.exitCode = 1; });
main().catch(error => { fs.mkdirSync(output, { recursive: true }); fs.writeFileSync(path.join(output, 'failure.json'), JSON.stringify({ stages: summaries, message: error instanceof Error ? error.message : 'Load test failed' }, null, 2)); console.error('LOAD FAILED: ' + (error instanceof Error ? error.message : 'Unknown error')); process.exitCode = 1; })
  .finally(async () => { generator?.kill(); api?.kill(); await prisma.$disconnect(); });
