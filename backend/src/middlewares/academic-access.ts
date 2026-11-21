import type {NextFunction,Response} from 'express';
import type {AuthenticatedRequest} from './auth-middleware';
import {ApiError} from '../errors/api-error';

// A administração global é um papel administrativo, nunca um desvio acadêmico.
export function denyGlobalAcademicAccess(req:AuthenticatedRequest,_res:Response,next:NextFunction){
  if(req.auth?.invitationPending)return next(new ApiError(403,'Conclua a aceitação do convite para acessar as atividades acadêmicas.'));
  if(req.auth?.role==='ADMIN')return next(new ApiError(403,'A administração geral não possui acesso pedagógico rotineiro.'));
  if(req.auth?.institutionalAccount && (!req.auth.institutionAdmin || !/^\/(turmas|atividades|avaliacoes|reports)(?:\/|\?|$)/.test(req.originalUrl)))return next(new ApiError(403,'Esta conta acompanha o cadastro institucional. As operações restritas exigem aprovação e vínculo administrativo válido.'));
  next();
}
