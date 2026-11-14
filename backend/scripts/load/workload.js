import http from 'k6/http';
import { check, fail, sleep } from 'k6';
import execution from 'k6/execution';

const fixture = JSON.parse(open(__ENV.FIXTURE_FILE));
const base = __ENV.BASE_URL;
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base) || base !== fixture.baseUrl || fixture.syntheticOnly !== true) {
  throw new Error('Only the harness-owned loopback API and synthetic fixtures are accepted.');
}
const vus = fixture.accounts.length;
if (vus < 1 || vus > 30) throw new Error('Load must stay between 1 and 30 virtual users.');
export const options = {
  scenarios: { students: { executor: 'per-vu-iterations', vus, iterations: 1, maxDuration: '120s', gracefulStop: '10s' } },
  thresholds: {
    checks: ['rate==1'], http_req_failed: [{ threshold: 'rate<0.01', abortOnFail: true, delayAbortEval: '15s' }],
    'http_req_duration{kind:common}': ['p(95)<2000'],
    'http_req_duration{kind:finalize}': ['p(95)<5000'],
    'http_req_duration{kind:login}': ['p(95)<2000'],
    iterations: [`count==${vus}`],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

function params(token, name, kind = 'common') {
  return { headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    tags: { name, kind }, timeout: '10s', redirects: 0 };
}
function body(response, name, expected = [200]) {
  if (!check(response, { [`${name}: expected HTTP status`]: r => expected.includes(r.status) })) fail(`${name}: unexpected status ${response.status}`);
  try { return response.json(); } catch { fail(`${name}: invalid JSON`); }
}
function request(method, path, data, token, name, kind = 'common', expected = [200]) {
  return body(http.request(method, base + path, data == null ? null : JSON.stringify(data), params(token, name, kind)), name, expected);
}
function duplicate(method, path, data, token, name, kind = 'common', expected = [200]) {
  return http.batch([0, 1].map(() => ({ method, url: base + path, body: JSON.stringify(data), params: params(token, name, kind) })))
    .map(response => body(response, name, expected));
}

export default function () {
  const account = fixture.accounts[execution.vu.idInTest - 1];
  if (!account) fail('Unique synthetic account missing.');
  const login = request('POST', '/auth/login', { email: account.email, senha: account.password }, null, 'login', 'login');
  if (!check(login, { 'login: identity belongs to virtual user': r => r.usuario.id === account.id && Boolean(r.token) })) fail('Incorrect login identity');
  const token = login.token;
  request('GET', '/auth/session', null, token, 'session');
  const started = duplicate('POST', '/initial-diagnostic', {}, token, 'diagnostic_start', 'common', [200, 201]);
  if (!check(started, { 'diagnostic: concurrent starts recover same attempt': r => r[0].attemptId === r[1].attemptId })) fail('Duplicate diagnostic');
  const id = started[0].attemptId;
  const questions = request('GET', `/initial-diagnostic/${id}/questions`, null, token, 'diagnostic_questions').questions;
  if (!check(questions, { 'diagnostic: 30 unique questions without answer key': rows => rows.length === 30 && new Set(rows.map(q => q.id)).size === 30 && rows.every(q => q.alternatives.every(a => !('correct' in a) && !('correta' in a))) })) fail('Invalid diagnostic');
  for (let index = 0; index < questions.length; index++) {
    const question = questions[index], option = question.alternatives.find(a => a.letter === (index % 2 ? 'B' : 'A'));
    const data = { selectedOptionId: option.id };
    request('PUT', `/initial-diagnostic/${id}/answers/${question.id}`, data, token, 'diagnostic_answer');
    if (index === 29) duplicate('PUT', `/initial-diagnostic/${id}/answers/${question.id}`, data, token, 'diagnostic_answer_retry');
    if (fixture.stage !== 'spike') sleep(0.75 + Math.random() * 0.5);
  }
  const finalized = duplicate('POST', `/initial-diagnostic/${id}/finalize`, {}, token, 'diagnostic_finalize', 'finalize');
  if (!check(finalized, { 'diagnostic: repeated finalize preserves score': results => results.every(r => r.correctAnswers === 15 && r.totalQuestions === 30 && r.overallPercentage === 50) })) fail('Invalid persisted diagnostic score');
  request('GET', `/initial-diagnostic/${id}/result`, null, token, 'diagnostic_result');
  request('GET', '/students/me/performance', null, token, 'performance');
  request('GET', '/students/me/activities', null, token, 'history');
  if (fixture.stage === 'spike') {
    const exams = duplicate('POST', '/individual-exams', {}, token, 'exam_start', 'common', [200, 201]);
    if (!check(exams, { 'exam: concurrent starts recover same attempt': rows => rows[0].attempt.id === rows[1].attempt.id })) fail('Duplicate individual exam');
    const exam = exams[0].attempt;
    if (!check(exam, { 'exam: 30 new unique questions': r => r.questions.length === 30 && new Set(r.questions.map(q => q.id)).size === 30 && r.questions.every(q => !questions.some(d => d.id === q.id)) })) fail('Repeated exam questions');
    for (let index = 0; index < exam.questions.length; index++) {
      const question = exam.questions[index], option = question.alternatives.find(a => a.letter === (index % 2 ? 'B' : 'A'));
      request('PUT', `/individual-exams/${exam.id}/answers/${question.id}`, { alternativeId: option.id }, token, 'exam_answer');
      sleep(0.75 + Math.random() * 0.5);
    }
    const results = duplicate('POST', `/individual-exams/${exam.id}/finalize`, {}, token, 'exam_finalize', 'finalize');
    if (!check(results, { 'exam: repeated finalize preserves score': rows => rows.every(r => r.result.correct === 15 && r.result.total === 30 && r.result.percentage === 50) })) fail('Invalid exam result');
    request('GET', `/individual-exams/${exam.id}/result`, null, token, 'exam_result');
    request('GET', '/students/me/performance', null, token, 'performance');
  }
}
export function handleSummary(data) { return { [__ENV.SUMMARY_FILE]: JSON.stringify(data, null, 2) }; }
