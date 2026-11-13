import {beforeEach,it,expect,vi} from 'vitest';
const db=vi.hoisted(()=>({findMany:vi.fn()}));
vi.mock('../lib/prisma',()=>({prisma:{user:{findMany:db.findMany}}}));
import {PasswordRecoveryRepository} from './password-recovery-repository';
beforeEach(()=>vi.clearAllMocks());
it('finds a legacy email case-insensitively and retains the stored recipient',async()=>{const account={id:'owner',email:'Legacy@Example.invalid',senhaHash:'fixture'};db.findMany.mockResolvedValue([account]);expect(await new PasswordRecoveryRepository().findAccount(' legacy@example.INVALID ')).toEqual(account);expect(db.findMany).toHaveBeenCalledWith(expect.objectContaining({where:{email:{equals:'legacy@example.invalid',mode:'insensitive'}},take:2}));});
it.each([{accounts:[]},{accounts:[{id:'one'},{id:'two'}]}])('does not expose or choose missing/ambiguous recovery identities',async ({accounts})=>{db.findMany.mockResolvedValue(accounts);expect(await new PasswordRecoveryRepository().findAccount('owner@example.invalid')).toBeNull();});
