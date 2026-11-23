import type { RequestHandler } from 'express';
import type { AuthenticatedRequest } from './auth-middleware';

// Ativação explícita apenas no processo. Nunca habilita privilégios nem altera a produção.
export function localReadOnlyNavigationEnabled() {
  return process.env.LOCAL_READ_ONLY_NAVIGATION === 'true'
    && process.env.NODE_ENV === 'development'
    && ['127.0.0.1', '::1', 'localhost'].includes(process.env.HOST ?? '');
}

export const localReadOnlyNavigation: RequestHandler = (request, response, next) => {
  if (!localReadOnlyNavigationEnabled()) return next();
  if (request.method === 'GET') {
    response.on('finish', () => console.info({
      type: 'local_read_only_navigation', method: 'GET',
      route: request.route?.path ?? 'unmatched', status: response.statusCode,
      role: (request as AuthenticatedRequest).auth?.role,
    }));
  }
  if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
  // Apenas treino de aluno autorizado pelo proprietário. O roteador ainda valida ALUNO,
  // a posse da tentativa, o estoque elegível e respostas imutáveis. Os demais módulos
  // continuam somente leitura; isto não autoriza tentativas reais criadas por agentes.
  if (process.env.QUESTION_PRACTICE_OWNER_AUTHORIZATION_ENABLED === 'true') {
    const id='[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
    if ((request.method==='POST' && /^\/question-practice\/?$/i.test(request.path))
      || (request.method==='POST' && new RegExp(`^/question-practice/${id}/finalize$`,'i').test(request.path))
      || (request.method==='PUT' && new RegExp(`^/question-practice/${id}/answers/${id}$`,'i').test(request.path))) return next();
  }
  // Ativação futura explícita apenas para esta capacidade; suas rotas ainda exigem
  // um ADMIN verificado, verificação de versão, evidências e um registro de auditoria atômico.
  // Todas as outras mutações administrativas/acadêmicas continuam bloqueadas localmente.
  if (process.env.QUESTION_EDITORIAL_WRITES_ENABLED === 'true') {
    const path = request.path;
    const id = '[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}';
    if ((request.method === 'PATCH' && new RegExp(`^/question-editorial/${id}/metadata$`, 'i').test(path))
      || (request.method === 'POST' && new RegExp(`^/question-editorial/${id}/(?:reviews/(?:legal|pedagogical)|release)$`, 'i').test(path))) return next();
  }
  // Preserva a autenticação normal e as rotas aprovadas de conta/perfil.
  // Operações acadêmicas/administrativas exigem autorização separada nesta sessão.
  if (!/^\/(institutions|turmas|avaliacoes|atividades|questoes|diagnostics|initial-diagnostic|question-practice|individual-exams|question-review|question-editorial|trilhas|goals)(\/|$)/i.test(request.path)) return next();
  response.setHeader('Cache-Control', 'no-store');
  response.status(403).json({ code: 'LOCAL_READ_ONLY_NAVIGATION', message: 'Esta execução local está autorizada somente para consulta. Operações de alteração exigem autorização específica.' });
};
