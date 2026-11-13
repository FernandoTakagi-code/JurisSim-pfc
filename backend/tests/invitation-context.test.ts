import {afterEach,beforeEach,expect,it,vi} from 'vitest';
let location:{hash:string;pathname:string};
beforeEach(()=>{
  vi.resetModules();vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
  location={hash:'#/convite-professor?token='+'a'.repeat(64),pathname:'/'};
  vi.stubGlobal('PopStateEvent',class extends Event {});
  vi.stubGlobal('window',{location,history:{replaceState:vi.fn(()=>{location.hash='';location.pathname='/convite-professor';})},dispatchEvent:vi.fn(),addEventListener:vi.fn()});
});
afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
it('captures only in memory and removes invitation credentials from the URL',async()=>{
  const context=await import('../../frontend/src/invitation-token');
  expect(context.pendingInvitation()).toBe('a'.repeat(64));expect(location.hash).toBe('');
  expect(context.invitationContextState()).toBe('captured');
});
it('a new page realm without the original link has no invitation context',async()=>{
  await import('../../frontend/src/invitation-token');vi.resetModules();
  const newPage=await import('../../frontend/src/invitation-token');
  expect(newPage.pendingInvitation()).toBeUndefined();expect(newPage.invitationContextState()).toBe('missing');
});
it('rejects incomplete or malformed links without allowing a request token',async()=>{
  location.hash='#/convite-professor?token=invalid';
  const context=await import('../../frontend/src/invitation-token');
  expect(context.pendingInvitation()).toBeUndefined();expect(context.invitationContextState()).toBe('invalid');expect(location.hash).toBe('');
});
it('ends the in-memory context after 48 hours independently of server expiry',async()=>{
  const context=await import('../../frontend/src/invitation-token');vi.advanceTimersByTime(48*3600000);
  expect(context.pendingInvitation()).toBeUndefined();expect(context.invitationContextState()).toBe('expired');
});
it('completion of legacy identity proof retains the original invitation until explicit acceptance',async()=>{
  location.hash='#/ativar-professor?convite='+'a'.repeat(64)+'&confirmacao='+'b'.repeat(64);
  const context=await import('../../frontend/src/invitation-token');context.clearInvitationProof();
  expect(context.pendingInvitation()).toBe('a'.repeat(64));expect(context.pendingInvitationProof()).toBeUndefined();
  context.clearInvitation();expect(context.pendingInvitation()).toBeUndefined();
});
