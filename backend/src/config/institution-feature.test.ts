import {afterEach, expect, it, vi} from 'vitest';
import {administrativeCapabilities} from './institution-feature';
afterEach(()=>vi.unstubAllEnvs());
for (const full of [false,true]) for (const admin of [false,true]) for (const registration of [false,true]) {
  it(`separates capabilities full=${full}, admin=${admin}, registration=${registration}`,()=>{
    vi.stubEnv('INSTITUTIONS_ENABLED',String(full));vi.stubEnv('ADMINISTRATION_ENABLED',String(admin));vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED',String(registration));
    const state=administrativeCapabilities();
    expect(state.enabled).toBe(full);
    expect(state.registrationEnabled).toBe(full||registration);
    expect(state.capabilities.users).toBe(full||admin);
    expect(state.capabilities.requests).toBe(full||admin||registration);
    expect(state.capabilities.classAssignment).toBe(false);
    expect(state.capabilities.classes).toBe(false);
    expect(state.capabilities.institutionalOperations).toBe(full);
  });
}
it('does not enable any write scope by default',()=>{
  vi.stubEnv('INSTITUTIONS_ENABLED','');vi.stubEnv('ADMINISTRATION_ENABLED','');vi.stubEnv('INSTITUTION_REGISTRATION_ENABLED','');
  expect(Object.values(administrativeCapabilities().capabilities).every(value=>!value)).toBe(true);
});
