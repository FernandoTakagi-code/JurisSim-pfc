import {expect,it,vi} from 'vitest';
import {denyGlobalAcademicAccess} from './academic-access';
import type {AuthenticatedRequest} from './auth-middleware';
import type {Response} from 'express';
it.each(['/turmas','/reports','/students/me','/avaliacoes','/goals','/questoes'])('pending invitation never grants academic access to %s',path=>{
  const next=vi.fn();
  denyGlobalAcademicAccess({auth:{userId:'pending',role:'ALUNO',invitationPending:true},originalUrl:path} as AuthenticatedRequest,{} as Response,next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({statusCode:403}));
});
