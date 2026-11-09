import type {NextFunction,Response} from 'express';
import type {AuthenticatedRequest} from './auth-middleware';
import {ApiError} from '../errors/api-error';

// Global administration is an administrative role, never an academic bypass.
export function denyGlobalAcademicAccess(req:AuthenticatedRequest,_res:Response,next:NextFunction){
  if(req.auth?.role==='ADMIN')return next(new ApiError(403,'A administração geral não possui acesso pedagógico rotineiro.'));
  next();
}
