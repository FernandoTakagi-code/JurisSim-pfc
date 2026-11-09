import {beforeEach,afterEach,it,expect,vi} from 'vitest';
const db = vi.hoisted(()=>({authToken:{findFirst:vi.fn(),updateMany:vi.fn()},user:{update:vi.fn()},institution:{updateMany:vi.fn()},$queryRaw:vi.fn(),$transaction:vi.fn()}));
vi.mock('../lib/prisma',()=>({prisma:db}));
import {AuthRepository} from './auth-repository';
beforeEach(()=>{
  vi.resetAllMocks();vi.stubEnv('INSTITUTIONS_ENABLED','false');vi.stubEnv('ADMINISTRATION_ENABLED','false');vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','false');
  db.$transaction.mockImplementation(async callback=>callback(db));db.$queryRaw.mockResolvedValue([{id:'owner'}]);
  db.authToken.findFirst.mockResolvedValue({id:'token',userId:'owner'});db.authToken.updateMany.mockResolvedValue({count:1});
});
afterEach(()=>vi.unstubAllEnvs());
it.each(['INSTITUTION_REGISTRATION_ENABLED','ADMINISTRATION_ENABLED'])('normal email verification advances only the owner pending request with %s',async flag=>{
  vi.stubEnv(flag,'true');const now=new Date();
  expect(await new AuthRepository().consumeEmailVerification('fixture-hash',now)).toBe(true);
  expect(db.institution.updateMany).toHaveBeenCalledWith({where:{ownerId:'owner',status:'EMAIL_PENDING'},data:{status:'PENDING'}});
  expect(db.user.update).toHaveBeenCalledWith(expect.objectContaining({data:expect.objectContaining({emailVerifiedAt:now})}));
  expect(db.user.update.mock.calls[0][0].data).not.toHaveProperty('role');
});
it('does not query institutional tables before any explicit capability is enabled',async()=>{
  await new AuthRepository().consumeEmailVerification('fixture-hash',new Date());
  expect(db.institution.updateMany).not.toHaveBeenCalled();
});
it('does not change requests when verification token is invalid or already consumed',async()=>{
  vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','true');db.authToken.updateMany.mockResolvedValue({count:0});
  expect(await new AuthRepository().consumeEmailVerification('fixture-hash',new Date())).toBe(false);
  expect(db.institution.updateMany).not.toHaveBeenCalled();expect(db.user.update).not.toHaveBeenCalled();
});
