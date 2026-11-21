import type { NextFunction, Request, Response } from 'express';
import { AuthService } from '../services/accounts/auth-service';
import { AuthRepository } from '../repositories/auth-repository';
import { ApiError } from '../errors/api-error';
import { currentAccess } from '../services/institutions/institution-service';
import { prisma } from '../lib/prisma';
import { currentLegalVersions } from '../services/accounts/terms-of-use';
import { isCurrentAcceptance } from '../services/accounts/legal-acceptance';
import { homologationParticipant, institutionRequestScope } from '../config/institution-homologation';
import { institutionsGloballyEnabled, institutionalTeacherManagementEnabled, institutionalExamManagementEnabled } from '../config/institution-feature';

const service = new AuthService();
const repository = new AuthRepository();
// Reutilizado apenas dentro de uma mesma requisição Express; as revogações são verificadas de novo na próxima.
const authenticatedRequests = new WeakSet<Request>();
function isTeacherManagementWrite(request: Request) {
  if (!institutionalTeacherManagementEnabled()) return false;
  const path = request.originalUrl.split('?')[0];
  if (request.method === 'PUT') return /^\/turmas\/[0-9a-f-]{36}\/teachers\/[0-9a-f-]{36}$/.test(path);
  if (request.method === 'POST') return /^\/institutions\/[0-9a-f-]{36}\/invitations(?:\/[0-9a-f-]{36}\/resend)?$/.test(path);
  if (request.method === 'DELETE') return /^\/institutions\/[0-9a-f-]{36}\/(?:invitations|teachers)\/[0-9a-f-]{36}$/.test(path);
  return false;
}

export interface AuthenticatedRequest extends Request {
  auth?: { userId: string; role: string; institutionId?: string; allowedClassIds?: string[]; institutionAdmin?:boolean;institutionalAccount?:boolean;invitationPending?:boolean };
}

function isInstitutionExamWrite(request: Request) {
  if (!institutionalExamManagementEnabled()) return false;
  const path = request.originalUrl.split('?')[0];
  const exam = '/[0-9a-f-]{36}';
  if (request.method === 'POST') return /^\/avaliacoes\/?$/.test(path) || new RegExp(`^/avaliacoes${exam}/(?:publish|close|archive)$`).test(path);
  if (request.method === 'PUT' || request.method === 'DELETE') return new RegExp(`^/avaliacoes${exam}$`).test(path);
  return false;
}

export async function requireAuth(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  response.set('Cache-Control', 'no-store');
  if (authenticatedRequests.has(request)) return next();
  return authenticate(request, error => {
    if (!error && request.auth) authenticatedRequests.add(request);
    if (error) next(error); else next();
  }, false);
}

// Exige e-mail confirmado, mas não o aceite dos Termos novos: quem não concorda ainda pode excluir a conta.
export async function requireAuthAllowingTermsUpdate(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  response.set('Cache-Control', 'no-store');
  return authenticate(request, next, false, true);
}

// Exceção explícita para inspeção de sessão, exportação pessoal, logout e reenvio da confirmação.
export async function requireLimitedAuth(request: AuthenticatedRequest, response: Response, next: NextFunction) {
  response.set('Cache-Control', 'no-store');
  return authenticate(request, next, true);
}

async function authenticate(request: AuthenticatedRequest, next: NextFunction, allowUnverified: boolean, allowOutdatedTerms = false) {
  const [scheme, token] = request.header('authorization')?.split(' ') ?? [];
  if (scheme !== 'Bearer' || !token) {
    return next(new ApiError(401, 'Autenticacao obrigatoria.'));
  }
  try {
    const payload = service.verifyToken(token);
    const user = await repository.findByIdForAuth(payload.id);
    if (!user || user.deletedAt || payload.sessionVersion !== user.sessionVersion) {
      return next(new ApiError(401, 'Sessão inválida.'));
    }
    if (!allowUnverified && !user.emailVerifiedAt) {
      return next(new ApiError(403, 'Confirme seu e-mail para acessar este recurso.'));
    }
    // Termos atualizados: só as rotas limitadas (sessão, logout, aceite) seguem até o novo aceite.
    // A versão em vigor vem de cache em memória; os campos do usuário já vieram na consulta acima.
    if (!allowUnverified && !allowOutdatedTerms && !isCurrentAcceptance(user, await currentLegalVersions())) {
      return next(new ApiError(403, 'Os Termos de Uso foram atualizados. Aceite a nova versão para continuar.', undefined, 'LEGAL_UPDATE_REQUIRED'));
    }
    const access = await currentAccess(
      user.id,
      user.role,
      user.registrationIntent === 'INSTITUTION' || request.header('x-institution-context') === 'administration',
    );
    request.auth = { userId: user.id, role: access?.effectiveRole ?? user.role, ...(user.role==='ALUNO'&&user.registrationIntent==='INSTITUTION'?{institutionalAccount:true}: {}) };
    if(user.role==='ALUNO'&&user.registrationIntent==='TEACHER_INVITATION')request.auth.invitationPending=true;
    const administrativeContext=request.header('x-institution-context') === 'administration';
    if (access && request.auth.role !== 'ADMIN' && (request.auth.role==='PROFESSOR'||administrativeContext)) {
      const requested = request.header('x-institution-id');
      const memberships = access.memberships.filter(m => m.role === (administrativeContext?'INSTITUTION_ADMIN':'TEACHER'));
      const institutionIds=[...new Set(memberships.map(m=>m.institutionId))];
      const selected = requested ? memberships.find(m => m.institutionId === requested) : institutionIds.length === 1 ? memberships[0] : undefined;
      request.auth.institutionAdmin = !!selected && administrativeContext;
      // As rotas de sessão e de convite continuam acessíveis antes de um contexto ser selecionado.
      if (requested && !selected) return next(new ApiError(403, 'Vínculo institucional não autorizado.'));
      if(administrativeContext&&!selected) return next(new ApiError(403,'Selecione uma instituição com administração ativa e autorizada.'));
      if (administrativeContext && 'readOnly' in access && access.readOnly && !['GET', 'HEAD', 'OPTIONS'].includes(request.method ?? 'GET') && !isTeacherManagementWrite(request) && !isInstitutionExamWrite(request))
        return next(new ApiError(503, 'Operações institucionais aguardam ativação autorizada. Este contexto está disponível somente para leitura.'));
      if (!selected && request.auth.role === 'PROFESSOR' && /^\/(turmas|avaliacoes|atividades|reports|questoes)(\/|\?|$)/.test(request.originalUrl)) return next(new ApiError(memberships.length?409:403, memberships.length?'Selecione uma instituição de trabalho.':'Vínculo docente ativo obrigatório. Regularize o acesso com a instituição responsável.'));
      request.auth.institutionId = selected?.institutionId;
      request.auth.allowedClassIds = selected ? (await prisma.institutionalClass.findMany({ where: { institutionId: selected.institutionId, ...(!administrativeContext?{turma:{professores:{some:{id:user.id}}}}:{}) }, select: { classId: true } })).map(c => c.classId) : [];
    }
    const restricted = !institutionsGloballyEnabled() ? homologationParticipant(user.id) : null;
    if(access?.restricted && !restricted) return next(new ApiError(403,'Escopo de homologação revogado.'));
    if (restricted) {
      // O módulo de questões está fora desta preparação e não deve herdar a visibilidade
      // mais ampla de turmas vinda da flag institucional da requisição.
      if (/^\/questoes(?:\/|\?|$)/.test(request.originalUrl)) return next(new ApiError(403,'Gestão de questões não integra o escopo de homologação institucional.'));
      return institutionRequestScope.run({userId:user.id,institutionId:restricted.institutionId,operational:access?.enabled === true}, () => next());
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAcademicStaff(req:AuthenticatedRequest,_res:Response,next:NextFunction){
  if(req.auth?.role==='PROFESSOR'||(req.auth?.role!=='ADMIN'&&req.auth?.institutionAdmin&&req.auth.institutionId))return next();
  next(new ApiError(403,'Gestão acadêmica não autorizada.'));
}

export function requireRoles(...roles: string[]) {
  return (request: AuthenticatedRequest, _response: Response, next: NextFunction) => {
    if (!request.auth) return next(new ApiError(401, 'Autenticação obrigatória.'));
    if (!roles.includes(request.auth.role)) return next(new ApiError(403, 'Acesso negado para este papel.'));
    next();
  };
}
